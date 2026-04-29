import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionBudgetTracker } from '../../../src/runtime/cost/execution-budget.js';
import { CostAwareProviderSelector } from '../../../src/runtime/cost/provider-selector.js';
// Mock provider for testing
class MockCostProvider {
    name;
    target;
    costUsd;
    latencyMs;
    health;
    constructor(name, target, costUsd, latencyMs, health = true) {
        this.name = name;
        this.target = target;
        this.costUsd = costUsd;
        this.latencyMs = latencyMs;
        this.health = health;
    }
    async healthCheck() {
        return this.health ? { healthy: true } : { healthy: false, reason: 'unhealthy mock' };
    }
    estimateCost(_task) {
        return this.costUsd;
    }
    estimateLatency(_task) {
        return this.latencyMs;
    }
    supportsTask(_task) {
        return true;
    }
    async runInference(_task) {
        throw new Error('not implemented in mock');
    }
    getCapabilities() {
        return {
            name: this.name,
            target: this.target,
            capabilities: ['chat'],
            maxContextTokens: 4096,
            supportsPrivateData: true
        };
    }
}
const cheapLocal = new MockCostProvider('cheap-cpu', 'LOCAL_CPU', 0.001, 200);
const expensiveCloud = new MockCostProvider('cloud-expensive', 'CLOUD_FALLBACK', 0.05, 500);
const healthyVllm = new MockCostProvider('vllm', 'VLLM_SERVER', 0.003, 150);
const unhealthyProvider = new MockCostProvider('unhealthy', 'LOCAL_GPU', 0.0, 100, false);
function baseTask(overrides = {}) {
    return {
        id: 'task-' + Math.random().toString(36).slice(2),
        type: 'chat',
        input: 'hello world',
        inputClassification: 'public',
        requiredCapability: 'chat',
        latencyPreferenceMs: 500,
        privacyRequirement: 'cloud-allowed',
        maxBudgetUsd: 0.01,
        fallbackAllowed: true,
        maxContextTokens: 1000,
        ...overrides
    };
}
describe('CostAwareProviderSelector', () => {
    let selector;
    let tracker;
    beforeEach(() => {
        selector = new CostAwareProviderSelector();
        tracker = new ExecutionBudgetTracker();
    });
    it('selects cheapest local provider when available and memory sufficient', async () => {
        const providers = [expensiveCloud, cheapLocal];
        const task = baseTask();
        tracker.allocate(task);
        // No memory constraints
        const decision = selector.select(task, providers, { memoryAvailableMB: 1024 });
        expect(decision.provider).toBe(cheapLocal);
        expect(decision.reason).toBe('local-available');
        expect(decision.fallbackEligible).toBe(true);
        expect(decision.costUsd).toBe(0.001);
    });
    it('falls back to cloud when local unavailable and fallback allowed', async () => {
        const providers = [expensiveCloud];
        const task = baseTask();
        tracker.allocate(task);
        const decision = selector.select(task, providers, {});
        expect(decision.provider).toBe(expensiveCloud);
        expect(decision.reason).toBe('cloud-fallback-only');
        expect(decision.fallbackEligible).toBe(false);
    });
    it('denies when budget exhausted and no fallback', async () => {
        const task = baseTask({ maxBudgetUsd: 0.0005 }); // smaller than cheapLocal cost
        tracker.allocate(task);
        // Record cost to exhaust budget
        tracker.recordSpend(task.id, 0.0005);
        // Exhausted
        expect(tracker.getState(task.id)?.exhausted).toBe(true);
        // Try to select again
        const decision = selector.select(task, [cheapLocal], {});
        expect(decision.provider).toBeNull();
        expect(decision.reason).toBe('local-over-budget');
        expect(decision.fallbackEligible).toBe(true); // still could if fallback allowed
    });
    it('fails when provider is unhealthy', async () => {
        const providers = [unhealthyProvider, cheapLocal];
        const task = baseTask();
        tracker.allocate(task);
        const decision = selector.select(task, providers, {});
        expect(decision.provider).toBe(cheapLocal); // healthy one
        expect(decision.reason).toBe('local-available');
    });
    it('returns no-providers when all providers unhealthy', async () => {
        const providers = [unhealthyProvider];
        const task = baseTask();
        tracker.allocate(task);
        const decision = selector.select(task, providers, {});
        expect(decision.provider).toBeNull();
        expect(decision.reason).toBe('local-unhealthy');
    });
    it('chooses cheapest remote when local excluded by memory', async () => {
        // Simulate low memory - local providers require >=128MB minimum
        const task = baseTask();
        tracker.allocate(task);
        const providers = [cheapLocal, expensiveCloud];
        const decision = selector.select(task, providers, { memoryAvailableMB: 50 }); // too low for local
        expect(decision.provider).toBe(expensiveCloud);
        expect(decision.reason).toBe('cloud-fallback-only');
    });
    it('respects fallbackAllowed flag', async () => {
        const task = baseTask({ fallbackAllowed: false });
        tracker.allocate(task);
        const providers = [cheapLocal]; // only local available
        const decision = selector.select(task, providers, {});
        expect(decision.provider).toBe(cheapLocal);
        expect(decision.fallbackEligible).toBe(false); // no fallback path
    });
    it('is deterministic for same inputs', async () => {
        const providers = [cheapLocal, healthyVllm, expensiveCloud];
        const task = baseTask();
        tracker.allocate(task);
        const decision1 = selector.select(task, providers, { memoryAvailableMB: 1024 });
        const decision2 = selector.select(task, providers, { memoryAvailableMB: 1024 });
        expect(decision1.provider?.name).toBe(decision2.provider?.name);
        expect(decision1.reason).toBe(decision2.reason);
        expect(decision1.costUsd).toBe(decision2.costUsd);
    });
});
