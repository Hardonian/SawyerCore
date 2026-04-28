import type { AiTask, InferenceResult, Capability } from '../types/contracts.js';
import type { ProviderConfig } from '../types/config.js';
import type { RuntimeProvider, ProviderCapabilities, ProviderTarget, ProviderHealth } from './provider.js';

interface ProviderOpts {
  name: string;
  target: ProviderTarget;
  healthy?: boolean;
  capabilities: Capability[];
  maxContextTokens?: number;
  supportsPrivateData?: boolean;
  baseCostPer1kTokens: number;
  baseLatencyMs: number;
}

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

  async healthCheck(): Promise<ProviderHealth> {
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

type FetchLike = typeof fetch;

abstract class OpenAiCompatibleProvider extends StubProvider {
  constructor(
    opts: ProviderOpts,
    private readonly providerConfig: ProviderConfig,
    private readonly fetcher: FetchLike = fetch
  ) {
    super(opts);
  }

  protected endpoint(path: string): string {
    return `${this.providerConfig.endpoint ?? ''}${path}`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.providerConfig.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.providerConfig.timeoutMs);
      try {
        const response = await this.fetcher(this.endpoint(path), { ...init, signal: controller.signal });
        if (!response.ok) {
          lastError = `${response.status} ${response.statusText}`;
          continue;
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = (error as Error).message;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`provider unavailable: ${this.name} (${lastError ?? 'unknown transport error'})`);
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.providerConfig.enabled) {
      return { healthy: false, reason: 'provider disabled' };
    }
    if (!this.providerConfig.endpoint) {
      return { healthy: false, reason: 'missing endpoint' };
    }
    try {
      const payload = await this.request<{ data?: Array<{ id: string }> }>('/models', { method: 'GET' });
      return {
        healthy: true,
        models: payload.data?.map((item) => item.id) ?? [],
        timeoutMs: this.providerConfig.timeoutMs
      };
    } catch (error) {
      return { healthy: false, reason: (error as Error).message, timeoutMs: this.providerConfig.timeoutMs };
    }
  }

  async runInference(task: AiTask): Promise<InferenceResult> {
    const payload = await this.request<{
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    }>('/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: `${this.name}-default-model`,
        messages: [{ role: 'user', content: task.input }],
        max_tokens: Math.min(task.maxContextTokens, this.getCapabilities().maxContextTokens)
      })
    });

    return {
      output: payload.choices?.[0]?.message?.content ?? `[${this.name}] empty completion`,
      provider: this.name,
      model: payload.model ?? `${this.name}-default-model`,
      latencyMs: this.estimateLatency(task),
      costUsd: this.estimateCost(task)
    };
  }
}

export class VllmProvider extends OpenAiCompatibleProvider {
  constructor(config: ProviderConfig = { name: 'vllm', endpoint: 'http://localhost:8000/v1', timeoutMs: 3500, retries: 1, enabled: true }, fetcher?: FetchLike) {
    super(
      {
        name: 'vllm',
        target: 'VLLM_SERVER',
        capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'planning'],
        maxContextTokens: 32768,
        baseCostPer1kTokens: 0.0002,
        baseLatencyMs: 170
      },
      config,
      fetcher
    );
  }
}

export class LiteLLMProvider extends OpenAiCompatibleProvider {
  constructor(config: ProviderConfig = { name: 'litellm', endpoint: 'http://localhost:4000/v1', timeoutMs: 3500, retries: 1, enabled: false }, fetcher?: FetchLike) {
    super(
      {
        name: 'litellm',
        target: 'LITELLM_PROXY',
        capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'vision', 'retrieval', 'planning'],
        supportsPrivateData: false,
        maxContextTokens: 128000,
        baseCostPer1kTokens: 0.001,
        baseLatencyMs: 260
      },
      config,
      fetcher
    );
  }
}

export class OnnxRuntimeProvider extends StubProvider {
  constructor() {
    super({
      name: 'onnx',
      target: 'LOCAL_CPU',
      capabilities: ['classification', 'embedding', 'summarization'],
      maxContextTokens: 4096,
      baseCostPer1kTokens: 0,
      baseLatencyMs: 90
    });
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
  constructor() {
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

  async runInference(task: AiTask): Promise<InferenceResult> {
    return {
      output: `[deterministic-${this.name}] ${task.id}`,
      provider: this.name,
      model: `${this.name}-default-model`,
      latencyMs: 10,
      costUsd: 0
    };
  }
}
