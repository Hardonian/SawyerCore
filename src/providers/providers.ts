import type { AiTask, InferenceResult, Capability } from '../types/contracts.js';
import type { RuntimeProvider, ProviderCapabilities, ProviderTarget } from './provider.js';

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
    return Number((((task.maxContextTokens / 1000) * this.baseCostPer1kTokens)).toFixed(6));
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

export class VllmProvider extends StubProvider {
  constructor() {
    super({
      name: 'vllm',
      target: 'VLLM_SERVER',
      capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'planning'],
      maxContextTokens: 32768,
      baseCostPer1kTokens: 0.0002,
      baseLatencyMs: 170
    });
  }
}

export class LiteLLMProvider extends StubProvider {
  constructor() {
    super({
      name: 'litellm',
      target: 'LITELLM_PROXY',
      capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'vision', 'retrieval', 'planning'],
      supportsPrivateData: false,
      maxContextTokens: 128000,
      baseCostPer1kTokens: 0.001,
      baseLatencyMs: 260
    });
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
}
