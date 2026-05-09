/**
 * Workflow orchestrator — processes work items through the execution engine.
 * Wraps the DeterministicEngine with retry logic, signal construction,
 * and result recording into the task detector and health aggregator.
 *
 * This is the bridge between the autonomy queue and the execution layer.
 */
const DEFAULT_SIGNALS = {
    batteryPercent: 100,
    thermalState: 'nominal',
    hardwareAvailable: {
        LOCAL_NPU: false,
        LOCAL_CPU: true,
        LOCAL_GPU: false,
        VLLM_SERVER: true,
        LITELLM_PROXY: false,
        CLOUD_FALLBACK: false
    },
    failureHistory: {}
};
const DEFAULT_ORCHESTRATOR_CONFIG = {
    defaultTenantId: 'default',
    defaultSignals: DEFAULT_SIGNALS
};
export class WorkflowOrchestrator {
    engine;
    taskDetector;
    intentResolver;
    healthAggregator;
    eventBus;
    config;
    failureHistory = {};
    constructor(engine, taskDetector, intentResolver, healthAggregator, eventBus, config = {}) {
        this.engine = engine;
        this.taskDetector = taskDetector;
        this.intentResolver = intentResolver;
        this.healthAggregator = healthAggregator;
        this.eventBus = eventBus;
        this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    }
    async processNext() {
        const workItem = this.taskDetector.dequeue();
        if (!workItem)
            return null;
        return this.processItem(workItem);
    }
    async processAll() {
        const pending = this.taskDetector.dequeueAll();
        const results = [];
        for (const item of pending) {
            const result = await this.processItem(item);
            results.push(result);
        }
        return results;
    }
    async processItem(workItem) {
        this.taskDetector.markRunning(workItem.id);
        const task = this.intentResolver.resolve(workItem.intent, this.config.intentDefaults);
        const signals = {
            ...this.config.defaultSignals,
            failureHistory: { ...this.failureHistory }
        };
        try {
            const receipt = await this.engine.execute(task, this.config.defaultTenantId, signals);
            if (receipt.decision === 'DENY' || receipt.degradedState !== 'NOMINAL') {
                const error = receipt.reasons.join('; ') || `degraded: ${receipt.degradedState}`;
                this.recordFailure(receipt.decision);
                this.healthAggregator.recordResult(false);
                this.taskDetector.markFailed(workItem.id, error);
                return {
                    workItemId: workItem.id,
                    receipt,
                    success: false,
                    error
                };
            }
            this.healthAggregator.recordResult(true);
            this.taskDetector.markCompleted(workItem.id, {
                runId: receipt.runId,
                decision: receipt.decision,
                degradedState: receipt.degradedState,
                latencyMs: receipt.latencyMs
            });
            return {
                workItemId: workItem.id,
                receipt,
                success: true,
                error: null
            };
        }
        catch (error) {
            const message = error.message;
            this.healthAggregator.recordResult(false);
            this.taskDetector.markFailed(workItem.id, message);
            return {
                workItemId: workItem.id,
                receipt: null,
                success: false,
                error: message
            };
        }
    }
    recordFailure(provider) {
        this.failureHistory[provider] = (this.failureHistory[provider] ?? 0) + 1;
    }
    getFailureHistory() {
        return { ...this.failureHistory };
    }
}
