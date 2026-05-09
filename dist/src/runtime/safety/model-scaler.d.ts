/**
 * Model auto-scaler — small → large fallback chain.
 * Uses model-packs.json as source of truth for tier definitions.
 * If a large model cannot fit resource constraints, falls back to smaller tiers.
 */
export interface ModelTier {
    id: string;
    sizeBytes: number;
    recommendedRamGb: number;
    contextLimit: number;
    taskSuitability: string[];
    provider: string;
}
export type ScalingDirection = 'UP' | 'DOWN' | 'HOLD';
export interface ScalingDecision {
    currentTier: string;
    targetTier: string;
    direction: ScalingDirection;
    reason: string;
}
export declare class ModelScaler {
    private readonly tiers;
    constructor(tiers: ModelTier[]);
    selectTier(availableRamGb: number, taskType: string): ModelTier | null;
    fallback(currentTierId: string, availableRamGb: number, taskType: string): ScalingDecision;
    selectSmallest(taskType: string): ModelTier | null;
    selectLargest(availableRamGb: number, taskType: string): ModelTier | null;
    listTiers(): readonly ModelTier[];
}
export declare function tiersFromModelPacks(models: Array<{
    id: string;
    size_bytes: number;
    recommended_ram_gb: number;
    context_limit: number;
    task_suitability: string[];
    recommended_provider: string;
}>): ModelTier[];
