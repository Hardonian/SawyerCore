/**
 * COST MODEL
 * Maps provider capabilities and usage to monetary cost estimates.
 *
 * Provides deterministic cost calculation per token for each provider.
 * Costs are derived from known pricing or estimated local compute cost.
 */

import type { AiTask } from '../../types/contracts.js';
import type { RuntimeProvider } from '../../providers/provider.js';

export interface CostProfile {
  providerName: string;
  costPerInputToken: number; // USD per token
  costPerOutputToken: number;
  baseCostUsd: number; // per-request fixed cost
  minCostUsd: number; // minimum charge per request
  notes: string; // free-form pricing source
}

const DEFAULT_COSTS: Record<string, CostProfile> = {
  'LOCAL_CPU': {
    providerName: 'LOCAL_CPU',
    costPerInputToken: 0.00000025,   // ~$0.25/M input tokens
    costPerOutputToken: 0.0000004,  // ~$0.40/M output tokens
    baseCostUsd: 0,
    minCostUsd: 0,
    notes: 'Estimated local electricity/compute amortization'
  },
  'LOCAL_NPU': {
    providerName: 'LOCAL_NPU',
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.00000025,
    baseCostUsd: 0,
    minCostUsd: 0,
    notes: 'Neural Processing Unit (efficient local)'
  },
  'LOCAL_GPU': {
    providerName: 'LOCAL_GPU',
    costPerInputToken: 0.0000003,
    costPerOutputToken: 0.0000005,
    baseCostUsd: 0,
    minCostUsd: 0,
    notes: 'Local discrete GPU compute'
  },
  'VLLM_SERVER': {
    providerName: 'VLLM_SERVER',
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.0000006,
    baseCostUsd: 0,
    minCostUsd: 0,
    notes: 'Self-hosted vLLM instance amortized'
  },
  'LITELLM_PROXY': {
    providerName: 'LITELLM_PROXY',
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000002,
    baseCostUsd: 0,
    minCostUsd: 0,
    notes: 'OpenAI-compatible proxy with unified billing'
  },
  'CLOUD_FALLBACK': {
    providerName: 'CLOUD_FALLBACK',
    costPerInputToken: 0.00001,
    costPerOutputToken: 0.00003,
    baseCostUsd: 0,
    minCostUsd: 0.001,
    notes: 'Cloud provider fallback (expensive)'
  }
};

export class CostModel {
  private profiles: Map<string, CostProfile> = new Map();

  constructor(profiles?: CostProfile[]) {
    // Initialize with defaults
    for (const [key, profile] of Object.entries(DEFAULT_COSTS)) {
      this.profiles.set(key, profile);
    }
    // Override with provided profiles
    if (profiles) {
      for (const profile of profiles) {
        this.profiles.set(profile.providerName, profile);
      }
    }
  }

  /**
   * Estimate cost for a task on a given provider.
   * Cost = base + max(minCost, input_tokens * in_rate + output_tokens * out_rate)
   */
  estimate(task: AiTask, provider: RuntimeProvider): number {
    const profile = this.profiles.get(provider.name) || this.profiles.get(provider.target);
    if (!profile) {
      // Unknown provider - use conservative cloud estimate
      return 0.01; // $0.01 minimum to flag as expensive
    }

    // Estimate tokens from input length (roughly 4 chars per token)
    const inputTokens = Math.ceil(task.input.length / 4);
    const outputTokens = Math.min(task.maxContextTokens * 0.2, 500); // conservative estimate

    const variableCost = (inputTokens * profile.costPerInputToken) + (outputTokens * profile.costPerOutputToken);
    const total = Math.max(profile.minCostUsd, profile.baseCostUsd + variableCost);

    return Math.round(total * 1000000) / 1000000; // micro-dollar precision
  }

  getProfile(providerName: string): CostProfile | undefined {
    return this.profiles.get(providerName);
  }

  updateProfile(profile: CostProfile): void {
    this.profiles.set(profile.providerName, profile);
  }
}
