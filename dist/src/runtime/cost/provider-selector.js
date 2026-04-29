/**
 * PROVIDER SELECTOR
 * Cost-aware provider selection that chooses between local and remote models
 * based on task complexity, latency budget, token budget, memory, and health.
 *
 * NEVER silently escalates to expensive path.
 * ALWAYS exposes explicit decision reason.
 */
import { CostModel } from './cost-model.js';
import { budgetTracker } from './execution-budget.js';
export class CostAwareProviderSelector {
    costModel;
    constructor(costModel) {
        this.costModel = costModel || new CostModel();
    }
    /**
     * Select the most cost-appropriate provider for a task.
     * Decision is deterministic for same inputs + provider state.
     */
    select(task, providers, signals) {
        // 1. Filter available providers
        const healthyProviders = [];
        for (const provider of providers) {
            const health = provider.healthCheck();
            if (!health.healthy) {
                // Skip but don't fail entire selection
                continue;
            }
            healthyProviders.push(provider);
        }
        if (healthyProviders.length === 0) {
            return {
                provider: null,
                reason: 'local-unhealthy',
                costUsd: 0,
                expectedLatencyMs: 0,
                budgetRemainingUsd: 0,
                fallbackEligible: false
            };
        }
        // 2. Get task budget state
        const budgetState = budgetTracker.getState(task.id);
        const remainingBudget = budgetState?.remainingUsd ?? Infinity;
        // 3. Check if task complexity justifies local vs remote
        // Complexity proxy: requiredCapability + context size + privacy requirement
        const isComplexTask = this.isComplexTask(task);
        const localMinimumMemoryMB = isComplexTask ? 512 : 128; // conservative
        const memoryOk = (signals.memoryAvailableMB ?? 1024) >= localMinimumMemoryMB;
        // Local providers are cheaper but require resources
        const localProviders = healthyProviders.filter(p => p.target === 'LOCAL_CPU' || p.target === 'LOCAL_GPU' || p.target === 'LOCAL_NPU');
        const remoteProviders = healthyProviders.filter(p => p.target === 'VLLM_SERVER' || p.target === 'LITELLM_PROXY' || p.target === 'CLOUD_FALLBACK');
        // 4. Decision tree (safest fix first)
        // Try local first if:
        // - memory OK
        // - budget not exhausted for this task
        // - local providers exist
        if (localProviders.length > 0 && memoryOk) {
            // Choose cheapest local provider
            const sortedLocals = localProviders.sort((a, b) => {
                const costA = this.costModel.estimate(task, a);
                const costB = this.costModel.estimate(task, b);
                return costA - costB;
            });
            const chosen = sortedLocals[0];
            const estimatedCost = this.costModel.estimate(task, chosen);
            // Check if we can afford this locally
            if (budgetTracker.canProceed(task.id, estimatedCost)) {
                return {
                    provider: chosen,
                    reason: 'local-available',
                    costUsd: estimatedCost,
                    expectedLatencyMs: chosen.estimateLatency(task),
                    budgetRemainingUsd: remainingBudget - estimatedCost,
                    fallbackEligible: true // can fallback to cloud if needed
                };
            }
            else {
                return {
                    provider: null,
                    reason: 'local-over-budget',
                    costUsd: estimatedCost,
                    expectedLatencyMs: chosen.estimateLatency(task),
                    budgetRemainingUsd: remainingBudget,
                    fallbackEligible: true
                };
            }
        }
        // 5. Remote fallback if allowed and available
        if (remoteProviders.length > 0 && task.fallbackAllowed) {
            // Choose cheapest remote
            const sortedRemotes = remoteProviders.sort((a, b) => {
                const costA = this.costModel.estimate(task, a);
                const costB = this.costModel.estimate(task, b);
                return costA - costB;
            });
            const chosen = sortedRemotes[0];
            const estimatedCost = this.costModel.estimate(task, chosen);
            return {
                provider: chosen,
                reason: 'cloud-fallback-only',
                costUsd: estimatedCost,
                expectedLatencyMs: chosen.estimateLatency(task),
                budgetRemainingUsd: remainingBudget - estimatedCost,
                fallbackEligible: false
            };
        }
        // 6. No viable provider
        return {
            provider: null,
            reason: 'no-providers',
            costUsd: 0,
            expectedLatencyMs: 0,
            budgetRemainingUsd: remainingBudget,
            fallbackEligible: false
        };
    }
    /**
     * Determine if task complexity warrants local execution consideration.
     */
    isComplexTask(task) {
        const complexCapabilities = ['vision', 'code-reasoning', 'agent-planning', 'retrieval-reranking-placeholder'];
        const largeContext = task.maxContextTokens > 4000;
        const sensitivePrivacy = task.privacyRequirement === 'local-only';
        const complexCapability = complexCapabilities.includes(task.requiredCapability) ||
            task.type === 'agent-planning';
        return largeContext || sensitivePrivacy || complexCapability;
    }
}
