import type { AiTask, InferenceResult, Capability } from '../types/contracts.js';

export type ProviderTarget =
  | 'LOCAL_NPU'
  | 'LOCAL_CPU'
  | 'LOCAL_GPU'
  | 'VLLM_SERVER'
  | 'LITELLM_PROXY'
  | 'CLOUD_FALLBACK';

export interface ProviderCapabilities {
  name: string;
  target: ProviderTarget;
  capabilities: Capability[];
  maxContextTokens: number;
  supportsPrivateData: boolean;
}

export interface RuntimeProvider {
  readonly name: string;
  readonly target: ProviderTarget;
  healthCheck(): Promise<{ healthy: boolean; reason?: string }>;
  estimateCost(task: AiTask): number;
  estimateLatency(task: AiTask): number;
  supportsTask(task: AiTask): boolean;
  runInference(task: AiTask): Promise<InferenceResult>;
  getCapabilities(): ProviderCapabilities;
}
