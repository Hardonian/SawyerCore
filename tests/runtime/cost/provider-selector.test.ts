import { describe, it, expect, beforeEach } from 'vitest';
import { budgetTracker } from '../../../src/runtime/cost/execution-budget.js';
import { CostAwareProviderSelector } from '../../../src/runtime/cost/provider-selector.js';
import type { AiTask } from '../../../src/types/contracts.js';
import type { RuntimeProvider, ProviderHealth, ProviderTarget, ProviderCapabilities } from '../../../src/providers/provider.js';

// Mock provider for testing
class MockCostProvider implements RuntimeProvider {
  constructor(
    public readonly name: string,
    public readonly target: ProviderTarget,
    private costUsd: number,
    private latencyMs: number,
    public health: boolean = true
  ) {}

  async healthCheck(): Promise<ProviderHealth> {
    return this.health ? { healthy: true } : { healthy: false, reason: 'unhealthy mock' };
  }

  estimateCost(_task: AiTask): number {
    return this.costUsd;
  }

  estimateLatency(_task: AiTask): number {
    return this.latencyMs;
  }

  supportsTask(_task: AiTask): boolean {
    return true;
  }

  async runInference(_task: AiTask): Promise<any> {
    throw new Error('not implemented in mock');
  }

  getCapabilities(): ProviderCapabilities {
    return {
      name: this.name,
      target: this.target,
      capabilities: ['chat'],
      maxContextTokens: 4096,
      supportsPrivateData: true
    };
  }
}

function baseTask(overrides: Partial<AiTask> = {}): AiTask {
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
  let selector: CostAwareProviderSelector;
  const cheapLocal = new MockCostProvider('local-1', 'LOCAL_CPU', 0.001, 100);
  const expensiveLocal = new MockCostProvider('local-2', 'LOCAL_GPU', 0.005, 50);
  const expensiveRemote = new MockCostProvider('remote-1', 'CLOUD_FALLBACK', 0.1, 500);
  const unhealthyLocal = new MockCostProvider('unhealthy-local', 'LOCAL_CPU', 0.0, 100, false);
  const unhealthyRemote = new MockCostProvider('unhealthy-remote', 'CLOUD_FALLBACK', 0.0, 500, false);

  beforeEach(() => {
    selector = new CostAwareProviderSelector();
    budgetTracker.reset();
  });

  it('selects cheapest local provider when available and memory sufficient', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [expensiveRemote, cheapLocal, expensiveLocal];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    expect(decision.provider).toBe(cheapLocal);
    expect(decision.reason).toBe('local-available');
    expect(decision.fallbackEligible).toBe(true);
    expect(decision.costUsd).toBeGreaterThan(0);
  });

  it('falls back to cloud when local unavailable and fallback allowed', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [expensiveRemote];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    expect(decision.provider).toBe(expensiveRemote);
    expect(decision.reason).toBe('cloud-fallback-only');
    expect(decision.fallbackEligible).toBe(false);
  });

  it('denies when budget exhausted and no fallback', async () => {
    const task = baseTask({ maxBudgetUsd: 0.000001 });
    budgetTracker.allocate(task);
    budgetTracker.recordSpend(task.id, 0.0001);
    
    const providers = [cheapLocal, expensiveRemote];
    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    
    expect(decision.provider).toBeNull();
    expect(decision.reason).toBe('local-over-budget');
    expect(decision.fallbackEligible).toBe(true);
  });

  it('fails when provider is unhealthy', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [unhealthyLocal, cheapLocal];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    expect(decision.provider).toBe(cheapLocal);
    expect(decision.reason).toBe('local-available');
  });

  it('returns no-providers when all providers unhealthy', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [unhealthyLocal, unhealthyRemote];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    expect(decision.provider).toBeNull();
    expect(decision.reason).toBe('local-unhealthy');
  });

  it('chooses cheapest remote when local excluded by memory', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [cheapLocal, expensiveRemote];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 16 });
    expect(decision.provider).toBe(expensiveRemote);
    expect(decision.reason).toBe('cloud-fallback-only');
  });

  it('respects fallbackAllowed flag', async () => {
    const task = baseTask({ fallbackAllowed: false });
    budgetTracker.allocate(task);
    const providers = [cheapLocal, expensiveRemote];

    const decision = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    expect(decision.provider).toBe(cheapLocal);
    expect(decision.fallbackEligible).toBe(true);
  });

  it('is deterministic for same inputs', async () => {
    const task = baseTask();
    budgetTracker.allocate(task);
    const providers = [cheapLocal, expensiveRemote];

    const d1 = await selector.select(task, providers, { memoryAvailableMB: 1024 });
    const d2 = await selector.select(task, providers, { memoryAvailableMB: 1024 });

    expect(d1.provider?.name).toBe(d2.provider?.name);
    expect(d1.costUsd).toBe(d2.costUsd);
  });
});
