import type { AiTask, InferenceResult, Capability } from '../types/contracts.js';
import type { RuntimeProvider, ProviderCapabilities, ProviderTarget } from './provider.js';
import type { SawyerConfig } from '../types/config.js';

type ProviderOpts = {
  name: string;
  target: ProviderTarget;
  healthy?: boolean;
  capabilities: Capability[];
  maxContextTokens?: number;
  supportsPrivateData?: boolean;
  baseCostPer1kTokens: number;
  baseLatencyMs: number;
};

export type OpenAiCompatibleProviderOpts = ProviderOpts & {
  endpoint: string;
  timeoutMs: number;
  retries: number;
  model: string;
  modelAliases?: Record<string, string>;
  apiKey?: string;
};

class StubProvider implements RuntimeProvider {
  public readonly name: string;
  public readonly target: ProviderTarget;
  protected healthy: boolean;
  protected caps: ProviderCapabilities;
  protected baseCostPer1kTokens: number;
  protected baseLatencyMs: number;

  constructor(opts: ProviderOpts) {
    this.name = opts.name;
    this.target = opts.target;
    this.healthy = opts.healthy ?? true;
    this.baseCostPer1kTokens = opts.baseCostPer1kTokens;
    this.baseLatencyMs = opts.baseLatencyMs;
    this.caps = {
      name: opts.name,
      target: opts.target,
      capabilities: opts.capabilities,
      maxContextTokens: opts.maxContextTokens ?? 8192,
      supportsPrivateData: opts.supportsPrivateData ?? true
    };
  }

  setHealth(healthy: boolean): void {
    this.healthy = healthy;
  }

  async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    return this.healthy ? { healthy: true } : { healthy: false, reason: `${this.name} unavailable` };
  }

  estimateCost(task: AiTask): number {
    return Number(((task.maxContextTokens / 1000) * this.baseCostPer1kTokens).toFixed(6));
  }

  estimateLatency(task: AiTask): number {
    const modifier = task.type === 'embedding' ? 0.6 : 1;
    return Math.round(this.baseLatencyMs * modifier);
  }

  supportsTask(task: AiTask): boolean {
    const taskMap: Record<string, Capability> = {
      chat: 'chat',
      summarization: 'summarization',
      'code-reasoning': 'code',
      embedding: 'embedding',
      classification: 'classification',
      'vision-placeholder': 'vision',
      'retrieval-reranking-placeholder': 'retrieval',
      'agent-planning': 'planning'
    };
    return this.caps.capabilities.includes(taskMap[task.type]) && task.maxContextTokens <= this.caps.maxContextTokens;
  }

  async runInference(task: AiTask): Promise<InferenceResult> {
    return {
      output: `[${this.name}] processed task ${task.id}`,
      provider: this.name,
      model: `${this.name}-default-model`,
      latencyMs: this.estimateLatency(task),
      costUsd: this.estimateCost(task)
    };
  }

  getCapabilities(): ProviderCapabilities {
    return this.caps;
  }
}

class OpenAiCompatibleProvider extends StubProvider {
  constructor(
    opts: OpenAiCompatibleProviderOpts,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    super(opts);
    this.endpoint = opts.endpoint.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs;
    this.retries = opts.retries;
    this.model = opts.model;
    this.modelAliases = opts.modelAliases ?? {};
    this.apiKey = opts.apiKey;
  }

  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly model: string;
  private readonly modelAliases: Record<string, string>;
  private readonly apiKey?: string;

  override async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    if (!this.endpoint) {
      return { healthy: false, reason: `${this.name} endpoint not configured` };
    }
    try {
      const models = await this.requestJson<{ data?: Array<{ id: string }> }>('GET', '/models');
      if (!models.data || models.data.length === 0) {
        return { healthy: false, reason: `${this.name} has no advertised models` };
      }
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: `${this.name} unreachable: ${(error as Error).message}` };
    }
  }

  override async runInference(task: AiTask): Promise<InferenceResult> {
    const resolvedModel = this.modelAliases[task.type] ?? this.model;
    const startedAt = Date.now();
    const payload = {
      model: resolvedModel,
      messages: [{ role: 'user', content: task.input }],
      max_tokens: Math.min(task.maxContextTokens, this.getCapabilities().maxContextTokens),
      stream: false
    };
    const body = await this.requestJson<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    }>('POST', '/chat/completions', payload);
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.name} response missing choices[0].message.content`);
    }
    return {
      output: content,
      provider: this.name,
      model: resolvedModel,
      latencyMs: Math.max(this.estimateLatency(task), Date.now() - startedAt),
      costUsd: this.estimateCost(task)
    };
  }

  private async requestJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let attempt = 0;
    let lastError: Error | undefined;
    while (attempt <= this.retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (this.apiKey) {
          headers.authorization = `Bearer ${this.apiKey}`;
        }
        const response = await this.fetchImpl(`${this.endpoint}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
      } finally {
        clearTimeout(timer);
      }
      attempt += 1;
    }
    throw lastError ?? new Error('request failed');
  }
}

export class VllmProvider extends OpenAiCompatibleProvider {
  constructor(
    opts: Omit<OpenAiCompatibleProviderOpts, keyof ProviderOpts> & Partial<ProviderOpts>,
    fetchImpl?: typeof fetch
  ) {
    super(
      {
        name: opts.name ?? 'vllm',
        target: opts.target ?? 'VLLM_SERVER',
        capabilities: opts.capabilities ?? ['chat', 'summarization', 'code', 'embedding', 'classification', 'planning'],
        maxContextTokens: opts.maxContextTokens ?? 32768,
        supportsPrivateData: opts.supportsPrivateData ?? true,
        baseCostPer1kTokens: opts.baseCostPer1kTokens ?? 0.0002,
        baseLatencyMs: opts.baseLatencyMs ?? 170,
        endpoint: opts.endpoint,
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        model: opts.model,
        modelAliases: opts.modelAliases,
        apiKey: opts.apiKey
      },
      fetchImpl
    );
  }
}

export class LiteLLMProvider extends OpenAiCompatibleProvider {
  constructor(
    opts: Omit<OpenAiCompatibleProviderOpts, keyof ProviderOpts> & Partial<ProviderOpts>,
    fetchImpl?: typeof fetch
  ) {
    super(
      {
        name: opts.name ?? 'litellm',
        target: opts.target ?? 'LITELLM_PROXY',
        capabilities: opts.capabilities ?? ['chat', 'summarization', 'code', 'embedding', 'classification', 'vision', 'retrieval', 'planning'],
        supportsPrivateData: opts.supportsPrivateData ?? false,
        maxContextTokens: opts.maxContextTokens ?? 128000,
        baseCostPer1kTokens: opts.baseCostPer1kTokens ?? 0.001,
        baseLatencyMs: opts.baseLatencyMs ?? 260,
        endpoint: opts.endpoint,
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        model: opts.model,
        modelAliases: opts.modelAliases,
        apiKey: opts.apiKey
      },
      fetchImpl
    );
  }
}

export class LlamaCppProvider extends StubProvider {
  constructor(
    private readonly opts: {
      endpoint: string;
      timeoutMs: number;
      retries: number;
      model: string;
      fetchImpl?: typeof fetch;
    }
  ) {
    super({
      name: 'llama.cpp',
      target: 'LOCAL_CPU',
      capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification'],
      maxContextTokens: 8192,
      supportsPrivateData: true,
      baseCostPer1kTokens: 0,
      baseLatencyMs: 340
    });
  }

  private get fetchImpl(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  override async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      const response = await this.fetchImpl(`${this.opts.endpoint.replace(/\/$/, '')}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        return { healthy: false, reason: `llama.cpp health endpoint HTTP ${response.status}` };
      }
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: `llama.cpp unreachable: ${(error as Error).message}` };
    }
  }

  override async runInference(task: AiTask): Promise<InferenceResult> {
    const startedAt = Date.now();
    const endpoint = `${this.opts.endpoint.replace(/\/$/, '')}/completion`;
    let attempt = 0;
    let lastError: Error | undefined;
    while (attempt <= this.opts.retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: task.input, n_predict: Math.min(256, task.maxContextTokens) }),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as { content?: string };
        if (!body.content) {
          throw new Error('missing llama.cpp content');
        }
        return {
          output: body.content,
          provider: this.name,
          model: this.opts.model,
          latencyMs: Math.max(this.estimateLatency(task), Date.now() - startedAt),
          costUsd: this.estimateCost(task)
        };
      } catch (error) {
        lastError = error as Error;
      } finally {
        clearTimeout(timer);
      }
      attempt += 1;
    }
    throw lastError ?? new Error('llama.cpp inference failed');
  }
}

export class MobileNpuProvider extends StubProvider {
  constructor() {
    super({
      name: 'mobileNpu',
      target: 'LOCAL_NPU',
      capabilities: ['classification', 'embedding', 'summarization'],
      maxContextTokens: 2048,
      baseCostPer1kTokens: 0,
      baseLatencyMs: 45
    });
  }
}

export class CloudFallbackProvider extends StubProvider {
  constructor(private readonly apiKey: string | undefined) {
    super({
      name: 'cloud',
      target: 'CLOUD_FALLBACK',
      capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'vision', 'retrieval', 'planning'],
      supportsPrivateData: false,
      maxContextTokens: 200000,
      baseCostPer1kTokens: 0.01,
      baseLatencyMs: 420
    });
  }

  override async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    if (!this.apiKey) {
      return { healthy: false, reason: 'cloud provider disabled: missing API key' };
    }
    return { healthy: true };
  }
}

export class MockProvider extends StubProvider {
  constructor(name = 'mock') {
    super({
      name,
      target: 'LOCAL_GPU',
      capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'vision', 'retrieval', 'planning'],
      maxContextTokens: 999999,
      baseCostPer1kTokens: 0,
      baseLatencyMs: 10
    });
  }
}

export function createProvidersFromConfig(config: SawyerConfig): RuntimeProvider[] {
  const providers: RuntimeProvider[] = [];
  if (config.providers.mobileNpu.enabled && config.toggles.enable_mobile_npu) {
    providers.push(new MobileNpuProvider());
  }
  if (config.providers.vllm.enabled && config.toggles.enable_vllm && config.providers.vllm.endpoint) {
    providers.push(
      new VllmProvider({
        endpoint: config.providers.vllm.endpoint,
        timeoutMs: config.providers.vllm.timeoutMs,
        retries: config.providers.vllm.retries,
        model: config.providers.vllm.model,
        modelAliases: config.providers.vllm.modelAliases,
        apiKey: config.providers.vllm.apiKeyEnv ? process.env[config.providers.vllm.apiKeyEnv] : undefined
      })
    );
  }
  if (config.providers.litellm.enabled && config.toggles.enable_litellm && config.providers.litellm.endpoint) {
    providers.push(
      new LiteLLMProvider({
        endpoint: config.providers.litellm.endpoint,
        timeoutMs: config.providers.litellm.timeoutMs,
        retries: config.providers.litellm.retries,
        model: config.providers.litellm.model,
        modelAliases: config.providers.litellm.modelAliases,
        apiKey: config.providers.litellm.apiKeyEnv ? process.env[config.providers.litellm.apiKeyEnv] : undefined
      })
    );
  }
  if (config.providers.llamaCpp.enabled && config.providers.llamaCpp.endpoint) {
    providers.push(
      new LlamaCppProvider({
        endpoint: config.providers.llamaCpp.endpoint,
        timeoutMs: config.providers.llamaCpp.timeoutMs,
        retries: config.providers.llamaCpp.retries,
        model: config.providers.llamaCpp.model
      })
    );
  }
  if (config.providers.cloud.enabled && config.toggles.enable_cloud_fallback && !config.toggles.enable_private_mode) {
    const apiKey = config.providers.cloud.apiKeyEnv ? process.env[config.providers.cloud.apiKeyEnv] : undefined;
    providers.push(new CloudFallbackProvider(apiKey));
  }
  return providers;
}
