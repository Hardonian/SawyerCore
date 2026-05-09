/**
 * Model auto-scaler — small → large fallback chain.
 * Uses model-packs.json as source of truth for tier definitions.
 * If a large model cannot fit resource constraints, falls back to smaller tiers.
 */
export class ModelScaler {
    tiers;
    constructor(tiers) {
        this.tiers = [...tiers].sort((a, b) => a.sizeBytes - b.sizeBytes || a.id.localeCompare(b.id));
    }
    selectTier(availableRamGb, taskType) {
        const eligible = this.tiers
            .filter((t) => t.recommendedRamGb <= availableRamGb)
            .filter((t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general'));
        if (eligible.length === 0)
            return null;
        return eligible[eligible.length - 1];
    }
    fallback(currentTierId, availableRamGb, taskType) {
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
                if (candidate.recommendedRamGb <= availableRamGb &&
                    (candidate.taskSuitability.includes(taskType) || candidate.taskSuitability.includes('general'))) {
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
    selectSmallest(taskType) {
        return (this.tiers.find((t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general')) ?? null);
    }
    selectLargest(availableRamGb, taskType) {
        const eligible = this.tiers
            .filter((t) => t.recommendedRamGb <= availableRamGb)
            .filter((t) => t.taskSuitability.includes(taskType) || t.taskSuitability.includes('general'));
        return eligible.length > 0 ? eligible[eligible.length - 1] : null;
    }
    listTiers() {
        return this.tiers;
    }
}
export function tiersFromModelPacks(models) {
    return models.map((m) => ({
        id: m.id,
        sizeBytes: m.size_bytes,
        recommendedRamGb: m.recommended_ram_gb,
        contextLimit: m.context_limit,
        taskSuitability: m.task_suitability,
        provider: m.recommended_provider
    }));
}
