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
    costPerInputToken: number;
    costPerOutputToken: number;
    baseCostUsd: number;
    minCostUsd: number;
    notes: string;
}
export declare class CostModel {
    private profiles;
    constructor(profiles?: CostProfile[]);
    /**
     * Estimate cost for a task on a given provider.
     * Cost = base + max(minCost, input_tokens * in_rate + output_tokens * out_rate)
     */
    estimate(task: AiTask, provider: RuntimeProvider): number;
    getProfile(providerName: string): CostProfile | undefined;
    updateProfile(profile: CostProfile): void;
}
