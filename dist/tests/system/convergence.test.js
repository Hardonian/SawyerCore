import { beforeEach, describe, expect, it } from 'vitest';
import { AuditLogger, InMemoryAuditSink } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { BillingController } from '../../src/billing/controller.js';
import { UsageTracker } from '../../src/billing/usage-tracker.js';
import { PricingCatalog } from '../../src/billing/pricing.js';
import { UnifiedExecutionGraph } from '../../src/system/execution-graph.js';
import { EventBus } from '../../src/system/events/event-bus.js';
import { TaskDetector } from '../../src/system/autonomy/task-detector.js';
import { IntentResolver } from '../../src/system/autonomy/intent-resolver.js';
import { WorkflowOrchestrator } from '../../src/system/autonomy/workflow-orchestrator.js';
import { HealthAggregator } from '../../src/system/health/health-aggregator.js';
import { SystemState } from '../../src/system/health/system-state.js';
import { AutonomyLoop } from '../../src/system/autonomy/autonomy-loop.js';
import { ResourceMonitor } from '../../src/runtime/safety/resource-monitor.js';
import { SelfHealer } from '../../src/system/health/self-healer.js';
import { ScheduleRegistry } from '../../src/system/events/schedule-registry.js';
const tenantId = 'tenant-convergence';
const baseTask = {
    id: 'converge-task',
    type: 'chat',
    input: 'Summarize the system convergence status.',
    inputClassification: 'public',
    requiredCapability: 'chat',
    latencyPreferenceMs: 500,
    privacyRequirement: 'cloud-allowed',
    maxBudgetUsd: 0.02,
    fallbackAllowed: true,
    maxContextTokens: 4096
};
describe('verify:end-to-end', () => {
    beforeEach(async () => {
        await UsageTracker.getInstance().clearTenantData(tenantId);
        PricingCatalog.assignTier(tenantId, 'starter');
    });
    it('runs one canonical graph across compression, intelligence, execution, billing, and history', async () => {
        const graph = newGraph([new CostedProvider('local-steady', 'LOCAL_CPU', 0.002, 80)]);
        const receipt = await graph.run({
            tenantId,
            task: baseTask,
            contextBlocks: [
                {
                    id: 'doctrine',
                    weight: 10,
                    text: 'SawyerCore must preserve truthful degraded states. SawyerCore must preserve truthful degraded states. '.repeat(8)
                }
            ],
            requiredTerms: ['truthful degraded states']
        });
        expect(receipt.decision).toBe('LOCAL_CPU');
        expect(receipt.degradedState).toBe('NOMINAL');
        expect(receipt.graph.compression.applied).toBe(true);
        expect(receipt.graph.compression.qualityStatus).toBe('passed');
        expect(receipt.graph.billing.recorded).toBe(true);
        expect(graph.getHistory()).toHaveLength(1);
        const report = await new BillingController().getUsageReport(tenantId, new Date('2020-01-01T00:00:00.000Z'), new Date('2100-12-31T23:59:59.999Z'));
        expect(report.breakdown.task.quantity).toBe(1);
        expect(report.breakdown.compute.quantity).toBeGreaterThan(0);
    });
});
describe('verify:autonomy', () => {
    beforeEach(async () => {
        await UsageTracker.getInstance().clearTenantData(tenantId);
        PricingCatalog.assignTier(tenantId, 'starter');
    });
    it('lets the autonomy loop execute queued work through the unified graph', async () => {
        const eventBus = new EventBus();
        const taskDetector = new TaskDetector(eventBus);
        const intentResolver = new IntentResolver();
        const systemState = new SystemState(eventBus);
        systemState.transition('NOMINAL', 'test start');
        const providers = [new CostedProvider('local-agent', 'LOCAL_CPU', 0.001, 70)];
        const graph = newGraph(providers);
        const healthAggregator = new HealthAggregator(providers, new ResourceMonitor(), systemState, eventBus);
        healthAggregator.markStarted();
        const selfHealer = new SelfHealer(eventBus, systemState);
        const scheduleRegistry = new ScheduleRegistry(eventBus);
        const orchestrator = new WorkflowOrchestrator(graph, taskDetector, intentResolver, healthAggregator, eventBus, {
            defaultTenantId: tenantId
        });
        const loop = new AutonomyLoop(orchestrator, taskDetector, healthAggregator, selfHealer, systemState, eventBus, scheduleRegistry, { maxTasksPerTick: 2, healthCheckIntervalTicks: 1 });
        taskDetector.enqueue('plan agent workflow for low resource execution', 'HIGH');
        const report = await loop.executeTick();
        expect(report.tasksProcessed).toBe(1);
        expect(taskDetector.getStats().completed).toBe(1);
        expect(graph.getHistory()[0]?.taskType).toBe('agent-planning');
        expect(report.healthReport?.healthyProviderCount).toBe(1);
    });
});
describe('verify:cost-efficiency', () => {
    beforeEach(async () => {
        await UsageTracker.getInstance().clearTenantData(tenantId);
        PricingCatalog.assignTier(tenantId, 'starter');
    });
    it('serves repeated semantic work from cache without provider cost', async () => {
        const graph = newGraph([new CostedProvider('local-costed', 'LOCAL_CPU', 0.01, 90)]);
        const first = await graph.run({ tenantId, task: baseTask });
        const second = await graph.run({ tenantId, task: { ...baseTask, id: 'converge-task-repeat' } });
        expect(first.graph.cache.hit).toBe(false);
        expect(first.result?.costUsd).toBeGreaterThan(0);
        expect(second.graph.cache.hit).toBe(true);
        expect(second.result?.costUsd).toBe(0);
        expect(graph.getCacheSize()).toBe(1);
    });
    it('uses stored outcomes to prefer the higher reliability provider', async () => {
        const graph = newGraph([
            new CostedProvider('fast-expensive', 'LOCAL_GPU', 0.01, 30),
            new CostedProvider('steady-cheap', 'LOCAL_CPU', 0.001, 180)
        ]);
        for (let i = 0; i < 3; i++) {
            graph.recordHistoricalOutcome(history('fast-expensive', false, 30, 0.01, i + 1, 'timeout'));
            graph.recordHistoricalOutcome(history('steady-cheap', true, 180, 0.001, i + 10));
        }
        const receipt = await graph.run({ tenantId, task: { ...baseTask, id: 'learned-routing' } });
        expect(receipt.result?.provider).toBe('steady-cheap');
        expect(receipt.graph.decision.selectedProvider).toBe('steady-cheap');
        expect(receipt.graph.optimization.preferredProviderName).toBe('steady-cheap');
    });
});
describe('verify:security', () => {
    beforeEach(async () => {
        await UsageTracker.getInstance().clearTenantData(tenantId);
        PricingCatalog.assignTier(tenantId, 'starter');
    });
    it('fails closed when sensitive data only has a cloud execution path', async () => {
        const config = safeDefaultConfig();
        config.policy.fallbackAllowed = true;
        config.policy.tenantPermissions.default.cloudAllowed = true;
        const graph = new UnifiedExecutionGraph([new CostedProvider('cloud-only', 'CLOUD_FALLBACK', 0.01, 220, false)], config, new AuditLogger(new InMemoryAuditSink()));
        const receipt = await graph.run({
            tenantId,
            task: {
                ...baseTask,
                id: 'sensitive-cloud-denied',
                inputClassification: 'sensitive',
                privacyRequirement: 'local-only',
                fallbackAllowed: false
            }
        });
        expect(receipt.decision).toBe('DENY');
        expect(receipt.degradedState).toBe('PARTIAL_EXECUTION');
        expect(receipt.result).toBeUndefined();
        expect(receipt.reasons.join(' ')).toContain('private/sensitive');
    });
    it('blocks over-budget work before any provider execution', async () => {
        const graph = newGraph([new CostedProvider('local-steady', 'LOCAL_CPU', 0.001, 80)]);
        const receipt = await graph.run({
            tenantId,
            task: {
                ...baseTask,
                id: 'over-budget',
                maxBudgetUsd: 1
            }
        });
        expect(receipt.decision).toBe('DENY');
        expect(receipt.graph.stages.some((stage) => stage.name === 'security_preflight' && stage.status === 'blocked')).toBe(true);
        expect(receipt.result).toBeUndefined();
    });
});
function newGraph(providers) {
    return new UnifiedExecutionGraph(providers, safeDefaultConfig(), new AuditLogger(new InMemoryAuditSink()), {
        cacheTtlMs: 120_000,
        defaultSignals: {
            batteryPercent: 100,
            thermalState: 'nominal',
            hardwareAvailable: {
                LOCAL_CPU: true,
                LOCAL_GPU: true,
                LOCAL_NPU: false,
                VLLM_SERVER: false,
                LITELLM_PROXY: false,
                CLOUD_FALLBACK: false
            },
            failureHistory: {}
        }
    });
}
function history(provider, success, latencyMs, costUsd, sequence, errorMessage = null) {
    return {
        runId: `${provider}-${sequence}`,
        inputHash: `input-${sequence}`,
        outputHash: success ? `output-${sequence}` : null,
        provider,
        model: `${provider}-model`,
        taskType: 'chat',
        degradedState: success ? 'NOMINAL' : 'MODEL_UNAVAILABLE',
        latencyMs,
        costUsd,
        success,
        errorMessage,
        timestampIso: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`
    };
}
class CostedProvider {
    costUsd;
    latencyMs;
    supportsPrivateData;
    name;
    target;
    constructor(name, target, costUsd, latencyMs, supportsPrivateData = true) {
        this.costUsd = costUsd;
        this.latencyMs = latencyMs;
        this.supportsPrivateData = supportsPrivateData;
        this.name = name;
        this.target = target;
    }
    estimateCost() {
        return this.costUsd;
    }
    estimateLatency() {
        return this.latencyMs;
    }
    async healthCheck() {
        return { healthy: true };
    }
    async runInference(task) {
        return {
            output: `[${this.name}] ${task.input.slice(0, 40)}`,
            provider: this.name,
            model: `${this.name}-deterministic-test-model`,
            latencyMs: this.latencyMs,
            costUsd: this.costUsd
        };
    }
    supportsTask(task) {
        return this.getCapabilities().capabilities.includes(capabilityForTask(task.type))
            && task.maxContextTokens <= this.getCapabilities().maxContextTokens;
    }
    getCapabilities() {
        return {
            name: this.name,
            target: this.target,
            capabilities: ['chat', 'summarization', 'code', 'embedding', 'classification', 'planning'],
            maxContextTokens: 8192,
            supportsPrivateData: this.supportsPrivateData
        };
    }
}
function capabilityForTask(taskType) {
    const map = {
        chat: 'chat',
        summarization: 'summarization',
        'code-reasoning': 'code',
        embedding: 'embedding',
        classification: 'classification',
        'vision-placeholder': 'vision',
        'retrieval-reranking-placeholder': 'retrieval',
        'agent-planning': 'planning'
    };
    return map[taskType];
}
