import { describe, it, expect } from 'vitest';
import { SafetyController } from '../../src/runtime/safety/safety-controller.js';
import { ResourceMonitor } from '../../src/runtime/safety/resource-monitor.js';
import { ModelScaler, tiersFromModelPacks } from '../../src/runtime/safety/model-scaler.js';
const baseTask = {
    id: 'safety-1',
    type: 'chat',
    input: 'safety test input',
    inputClassification: 'public',
    requiredCapability: 'chat',
    latencyPreferenceMs: 200,
    privacyRequirement: 'cloud-allowed',
    maxBudgetUsd: 0.2,
    fallbackAllowed: true,
    maxContextTokens: 1000
};
const defaultSignals = {
    batteryPercent: 80,
    thermalState: 'nominal',
    hardwareAvailable: { LOCAL_GPU: true },
    failureHistory: {}
};
class SuccessDelegate {
    async execute(_task, _tenantId, _signals) {
        return {
            decision: 'LOCAL_GPU',
            result: {
                output: 'success output',
                provider: 'mock',
                model: 'mock-model',
                latencyMs: 10,
                costUsd: 0
            },
            reasons: []
        };
    }
}
class FailingDelegate {
    async execute() {
        throw new Error('delegate failure');
    }
}
class DegradedDelegate {
    async execute() {
        return {
            decision: 'DENY',
            reasons: ['no providers available'],
            degraded: true
        };
    }
}
describe('verify:degraded-modes', () => {
    it('SafetyController never hard-crashes on execution failure', async () => {
        const controller = new SafetyController({ maxRetries: 2 });
        const result = await controller.safeExecute(new FailingDelegate(), baseTask, 'default', defaultSignals);
        expect(result.success).toBe(false);
        expect(result.degradedState).toBe('PARTIAL_EXECUTION');
        expect(result.reasons[0]).toContain('execution failed after 3 attempts');
        expect(result.result).toBeNull();
    });
    it('SafetyController returns MODEL_UNAVAILABLE when delegate reports degraded', async () => {
        const controller = new SafetyController();
        const result = await controller.safeExecute(new DegradedDelegate(), baseTask, 'default', defaultSignals);
        expect(result.success).toBe(false);
        expect(result.degradedState).toBe('MODEL_UNAVAILABLE');
        expect(result.result).toBeNull();
    });
    it('SafetyController returns NOMINAL on clean execution', async () => {
        const controller = new SafetyController();
        const result = await controller.safeExecute(new SuccessDelegate(), baseTask, 'default', defaultSignals);
        expect(result.success).toBe(true);
        expect(result.degradedState).toBe('NOMINAL');
        expect(result.result).not.toBeNull();
        expect(result.result?.output).toBe('success output');
    });
    it('ResourceMonitor returns a valid snapshot', () => {
        const monitor = new ResourceMonitor();
        const snapshot = monitor.sample();
        expect(snapshot.cpuCount).toBeGreaterThan(0);
        expect(snapshot.memoryTotalBytes).toBeGreaterThan(0);
        expect(snapshot.memoryUsagePercent).toBeGreaterThanOrEqual(0);
        expect(snapshot.memoryUsagePercent).toBeLessThanOrEqual(100);
        expect(snapshot.heapUsedBytes).toBeGreaterThan(0);
        expect(snapshot.rssBytes).toBeGreaterThan(0);
    });
    it('ResourceMonitor assessment returns structured result', () => {
        const monitor = new ResourceMonitor();
        const assessment = monitor.assess();
        expect(assessment.memoryPressure).toMatch(/^(NOMINAL|SOFT_LIMIT|HARD_LIMIT)$/);
        expect(typeof assessment.cpuConstrained).toBe('boolean');
        expect(typeof assessment.shouldThrottle).toBe('boolean');
        expect(Array.isArray(assessment.reasons)).toBe(true);
    });
});
describe('verify:low-resource', () => {
    it('ModelScaler selects appropriate tier for constrained RAM', () => {
        const tiers = tiersFromModelPacks([
            {
                id: 'tiny-q4',
                size_bytes: 433_000_000,
                recommended_ram_gb: 4,
                context_limit: 4096,
                task_suitability: ['chat', 'summarization'],
                recommended_provider: 'llama.cpp'
            },
            {
                id: 'balanced-q4',
                size_bytes: 2_100_000_000,
                recommended_ram_gb: 8,
                context_limit: 8192,
                task_suitability: ['chat', 'coding', 'general'],
                recommended_provider: 'llama.cpp'
            },
            {
                id: 'quality-q4',
                size_bytes: 4_700_000_000,
                recommended_ram_gb: 16,
                context_limit: 8192,
                task_suitability: ['chat', 'reasoning', 'quality-local'],
                recommended_provider: 'llama.cpp'
            }
        ]);
        const scaler = new ModelScaler(tiers);
        const fourGb = scaler.selectTier(4, 'chat');
        expect(fourGb).not.toBeNull();
        expect(fourGb?.id).toBe('tiny-q4');
        const eightGb = scaler.selectTier(8, 'chat');
        expect(eightGb).not.toBeNull();
        expect(eightGb?.id).toBe('balanced-q4');
        const sixteenGb = scaler.selectTier(16, 'chat');
        expect(sixteenGb).not.toBeNull();
        expect(sixteenGb?.id).toBe('quality-q4');
        const twoGb = scaler.selectTier(2, 'chat');
        expect(twoGb).toBeNull();
    });
    it('ModelScaler falls back to smaller tier when RAM insufficient', () => {
        const tiers = tiersFromModelPacks([
            {
                id: 'tiny-q4',
                size_bytes: 433_000_000,
                recommended_ram_gb: 4,
                context_limit: 4096,
                task_suitability: ['chat', 'summarization'],
                recommended_provider: 'llama.cpp'
            },
            {
                id: 'quality-q4',
                size_bytes: 4_700_000_000,
                recommended_ram_gb: 16,
                context_limit: 8192,
                task_suitability: ['chat', 'reasoning'],
                recommended_provider: 'llama.cpp'
            }
        ]);
        const scaler = new ModelScaler(tiers);
        const decision = scaler.fallback('quality-q4', 4, 'chat');
        expect(decision.direction).toBe('DOWN');
        expect(decision.targetTier).toBe('tiny-q4');
        expect(decision.reason).toContain('insufficient RAM');
    });
    it('ModelScaler holds when resources are sufficient', () => {
        const tiers = tiersFromModelPacks([
            {
                id: 'tiny-q4',
                size_bytes: 433_000_000,
                recommended_ram_gb: 4,
                context_limit: 4096,
                task_suitability: ['chat'],
                recommended_provider: 'llama.cpp'
            }
        ]);
        const scaler = new ModelScaler(tiers);
        const decision = scaler.fallback('tiny-q4', 8, 'chat');
        expect(decision.direction).toBe('HOLD');
        expect(decision.targetTier).toBe('tiny-q4');
    });
    it('process runs under constrained footprint', () => {
        const mem = process.memoryUsage();
        const rssMb = mem.rss / (1024 * 1024);
        expect(rssMb).toBeLessThan(4096);
    });
});
