/**
 * Safety controller — fail-safe execution wrapper.
 * Never hard-fails user-facing routes.
 * Explicit degraded states: MODEL_UNAVAILABLE, LOW_MEMORY, PARTIAL_EXECUTION.
 */
import { ResourceMonitor } from './resource-monitor.js';
import { ModelScaler } from './model-scaler.js';
const DEFAULT_SAFETY_CONFIG = {
    maxRetries: 1
};
export class SafetyController {
    monitor;
    scaler;
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
        this.monitor = new ResourceMonitor(this.config.resourceLimits);
        this.scaler = this.config.modelTiers ? new ModelScaler(this.config.modelTiers) : null;
    }
    async safeExecute(delegate, task, tenantId, signals) {
        const assessment = this.monitor.assess();
        if (assessment.memoryPressure === 'HARD_LIMIT') {
            return {
                success: false,
                degradedState: 'LOW_MEMORY',
                result: null,
                reasons: ['hard memory limit exceeded; execution blocked', ...assessment.reasons],
                resourceSnapshot: {
                    memoryPressure: assessment.memoryPressure,
                    cpuConstrained: assessment.cpuConstrained,
                    shouldThrottle: assessment.shouldThrottle
                },
                modelTier: null
            };
        }
        const modelTier = this.scaler
            ? this.scaler.selectTier(assessment.snapshot.memoryFreeBytes / (1024 * 1024 * 1024), task.type)
            : null;
        let lastError = null;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const result = await delegate.execute(task, tenantId, signals);
                if (result.degraded) {
                    return {
                        success: false,
                        degradedState: 'MODEL_UNAVAILABLE',
                        result: result.result ?? null,
                        reasons: result.reasons,
                        resourceSnapshot: {
                            memoryPressure: assessment.memoryPressure,
                            cpuConstrained: assessment.cpuConstrained,
                            shouldThrottle: assessment.shouldThrottle
                        },
                        modelTier: modelTier?.id ?? null
                    };
                }
                return {
                    success: true,
                    degradedState: assessment.memoryPressure === 'SOFT_LIMIT' ? 'PARTIAL_EXECUTION' : 'NOMINAL',
                    result: result.result ?? null,
                    reasons: assessment.memoryPressure === 'SOFT_LIMIT' ? ['operating under memory soft limit'] : [],
                    resourceSnapshot: {
                        memoryPressure: assessment.memoryPressure,
                        cpuConstrained: assessment.cpuConstrained,
                        shouldThrottle: assessment.shouldThrottle
                    },
                    modelTier: modelTier?.id ?? null
                };
            }
            catch (error) {
                lastError = error.message;
            }
        }
        return {
            success: false,
            degradedState: 'PARTIAL_EXECUTION',
            result: null,
            reasons: [`execution failed after ${this.config.maxRetries + 1} attempts: ${lastError}`],
            resourceSnapshot: {
                memoryPressure: assessment.memoryPressure,
                cpuConstrained: assessment.cpuConstrained,
                shouldThrottle: assessment.shouldThrottle
            },
            modelTier: modelTier?.id ?? null
        };
    }
    getResourceAssessment() {
        return this.monitor.assess();
    }
    getModelScaler() {
        return this.scaler;
    }
}
