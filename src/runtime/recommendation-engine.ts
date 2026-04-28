import type { DeviceInventory } from './onboarding.js';
import { recommendProfile } from './onboarding.js';

export interface RecommendationOutput {
  profile: string;
  providerPriority: string[];
  modelsByTask: Record<string, string[]>;
  quantization: 'q4' | 'q6' | 'fp16';
  preloadPlan: string[];
  privacyPolicy: string;
  costControls: string[];
  explanation: string;
  confidence: number;
  warnings: string[];
}

export function generateDeterministicRecommendation(inventory: DeviceInventory): RecommendationOutput {
  const profile = recommendProfile(inventory);
  const quantization = inventory.ramGb < 16 ? 'q4' : inventory.hasGpu ? 'fp16' : 'q6';
  const providerPriority = inventory.hasNpu
    ? ['mobile-npu', 'onnx-local', 'vllm', 'litellm', 'cloud']
    : ['onnx-local', 'vllm', 'litellm', 'cloud'];
  const warnings: string[] = [];
  if (inventory.ramGb < 8) warnings.push('Low RAM detected; model choices are constrained.');
  if (inventory.batterySensitive) warnings.push('Battery-sensitive device: disable aggressive preloading.');

  return {
    profile,
    providerPriority,
    modelsByTask: {
      chat: ['tinyllama-local', 'mistral-local', 'gpt-4o-mini-cloud'],
      summarization: ['flan-t5-small-local', 'llama-3-vllm', 'gpt-4o-mini-cloud'],
      classification: ['mobilebert-onnx', 'distilbert-cpu'],
      embeddings: ['bge-small-local', 'e5-small-mobile', 'bge-large-server'],
      code: ['deepseek-coder-local', 'codestral-vllm', 'gpt-4.1-mini-cloud']
    },
    quantization,
    preloadPlan: profile === 'performance' ? ['chat', 'code', 'embeddings'] : ['chat', 'embeddings'],
    privacyPolicy: profile === 'local-safe' ? 'local-only retention none' : 'local-first with guarded cloud egress',
    costControls: ['max_cost_per_request', 'token_cap', 'cloud_budget_cap'],
    explanation: `Recommended ${profile} based on ${inventory.deviceType}/${inventory.os} and your preferences.`,
    confidence: 0.86,
    warnings
  };
}

export function maybeGenerateAiExplanation(base: RecommendationOutput, enabled: boolean): RecommendationOutput {
  if (!enabled) return base;
  return {
    ...base,
    explanation: `${base.explanation} AI explanation enabled: tradeoffs were expanded without changing policy decisions.`
  };
}
