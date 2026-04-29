/**
 * PROVIDER SELECTOR
 * Cost-aware provider selection that chooses between local and remote models
 * based on task complexity, latency budget, token budget, memory, and health.
 *
 * NEVER silently escalates to expensive path.
 * ALWAYS exposes explicit decision reason.
 */
import type { AiTask } from '../../types/contracts.js';
import type { RuntimeProvider } from '../../providers/provider.js';
import { CostModel } from './cost-model.js';
export type SelectionReason = 'local-available' | 'local-memory-constrained' | 'local-over-budget' | 'local-unhealthy' | 'cloud-cheaper' | 'cloud-budget-exhausted' | 'cloud-fallback-only' | 'provider-blocked' | 'no-providers';
export interface SelectionDecision {
    provider: RuntimeProvider | null;
    reason: SelectionReason;
    costUsd: number;
    expectedLatencyMs: number;
    budgetRemainingUsd: number;
    fallbackEligible: boolean;
}
export declare class CostAwareProviderSelector {
    private costModel;
    constructor(costModel?: CostModel);
    /**
     * Select the most cost-appropriate provider for a task.
     * Decision is deterministic for same inputs + provider state.
     */
    select(task: AiTask, providers: RuntimeProvider[], signals: {
        memoryAvailableMB?: number;
        batteryPercent?: number;
        thermalState?: 'nominal' | 'warm' | 'hot';
    }): SelectionDecision;
    /**
     * Determine if task complexity warrants local execution consideration.
     */
    private isComplexTask;
}
