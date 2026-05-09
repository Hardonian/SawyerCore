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

export class ModelScaler {
  private readonly tiers: ModelTier[];

  constructor(tiers: ModelTier[]) {
    this.tiers = [...tiers].sort((a, b) => a.sizeBytes - b.sizeBytes || a.id.localeCompare(b.id));
  }

  selectTier(availableRamGb: number, taskType: string): ModelTier | null {
    const eligible = this.tiers
      .filter((t) => t.recommendedRamGb <= availableRamGb)
      .filter((t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general'));

    if (eligible.length === 0) return null;
    return eligible[eligible.length - 1];
  }

  fallback(currentTierId: string, availableRamGb: number, taskType: string): ScalingDecision {
    const currentIndex = this.tiers.findIndex((t) => t.id === currentTierId);

    if (currentIndex < 0) {
      const smallest = this.selectSmallest(taskType);
      return {
        currentTier: currentTierId,
        targetTier: smallest?.id ?? 'none',
        direction: 'DOWN',
        reason: 'current tier not found; falling back to smallest available'
      };
    }

    const current = this.tiers[currentIndex];

    if (current.recommendedRamGb > availableRamGb) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const candidate = this.tiers[i];
        if (
          candidate.recommendedRamGb <= availableRamGb &&
          (candidate.taskSuitability.includes(taskType) || candidate.taskSuitability.includes('general'))
        ) {
          return {
            currentTier: currentTierId,
            targetTier: candidate.id,
            direction: 'DOWN',
            reason: `insufficient RAM (${availableRamGb}GB) for ${currentTierId} (needs ${current.recommendedRamGb}GB)`
          };
        }
      }
      return {
        currentTier: currentTierId,
        targetTier: 'none',
        direction: 'DOWN',
        reason: 'no tier fits available RAM'
      };
    }

    return {
      currentTier: currentTierId,
      targetTier: currentTierId,
      direction: 'HOLD',
      reason: 'current tier fits resource constraints'
    };
  }

  selectSmallest(taskType: string): ModelTier | null {
    return (
      this.tiers.find(
        (t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general')
      ) ?? null
    );
  }

  selectLargest(availableRamGb: number, taskType: string): ModelTier | null {
    const eligible = this.tiers
      .filter((t) => t.recommendedRamGb <= availableRamGb)
      .filter((t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general'));

    return eligible.length > 0 ? eligible[eligible.length - 1] : null;
  }

  listTiers(): readonly ModelTier[] {
    return this.tiers;
  }
}

export function tiersFromModelPacks(
  models: Array<{
    id: string;
    size_bytes: number;
    recommended_ram_gb: number;
    context_limit: number;
    task_suitability: string[];
    recommended_provider: string;
  }>
): ModelTier[] {
  return models.map((m) => ({
    id: m.id,
    sizeBytes: m.size_bytes,
    recommendedRamGb: m.recommended_ram_gb,
    contextLimit: m.context_limit,
    taskSuitability: m.task_suitability,
    provider: m.recommended_provider
  }));
}
