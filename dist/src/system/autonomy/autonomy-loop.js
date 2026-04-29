/**
 * Autonomy loop — the 24/7 main controller.
 * Coordinates task detection, workflow execution, health checks,
 * self-healing, and scheduled triggers in a single controlled loop.
 *
 * Uses AbortController for clean shutdown — no dangling timers.
 * Each tick is a complete cycle: detect → execute → heal → report.
 */
const DEFAULT_LOOP_CONFIG = {
    tickIntervalMs: 5000,
    maxTasksPerTick: 10,
    healthCheckIntervalTicks: 5,
    providerNames: []
};
export class AutonomyLoop {
    orchestrator;
    taskDetector;
    healthAggregator;
    selfHealer;
    systemState;
    eventBus;
    scheduleRegistry;
    config;
    running = false;
    tickNumber = 0;
    abortController = null;
    constructor(orchestrator, taskDetector, healthAggregator, selfHealer, systemState, eventBus, scheduleRegistry, config = {}) {
        this.orchestrator = orchestrator;
        this.taskDetector = taskDetector;
        this.healthAggregator = healthAggregator;
        this.selfHealer = selfHealer;
        this.systemState = systemState;
        this.eventBus = eventBus;
        this.scheduleRegistry = scheduleRegistry;
        this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
    }
    async start() {
        if (this.running) {
            throw new Error('AutonomyLoop: already running');
        }
        this.running = true;
        this.abortController = new AbortController();
        this.systemState.transition('NOMINAL', 'autonomy loop started');
        this.healthAggregator.markStarted();
        this.eventBus.emit('SYSTEM_STARTED', {
            tickIntervalMs: this.config.tickIntervalMs,
            providers: this.config.providerNames
        });
        await this.runLoop(this.abortController.signal);
    }
    stop(reason = 'manual stop') {
        if (!this.running)
            return;
        this.running = false;
        this.abortController?.abort();
        this.abortController = null;
        const uptimeMs = Math.round(performance.now());
        if (this.systemState.canTransition('STOPPED')) {
            this.systemState.transition('STOPPED', reason);
        }
        this.eventBus.emit('SYSTEM_STOPPED', { reason, uptimeMs });
    }
    async executeTick() {
        const startMs = performance.now();
        const currentTick = this.tickNumber++;
        this.healthAggregator.incrementTick();
        const nowMs = Date.now();
        const scheduledFired = await this.scheduleRegistry.tick(nowMs);
        const results = [];
        let processed = 0;
        while (processed < this.config.maxTasksPerTick && this.taskDetector.pendingCount() > 0) {
            if (!this.systemState.isOperational())
                break;
            const result = await this.orchestrator.processNext();
            if (!result)
                break;
            results.push(result);
            processed++;
        }
        let healthReport = null;
        let healingActions = [];
        if (currentTick % this.config.healthCheckIntervalTicks === 0 || !this.systemState.isOperational()) {
            healthReport = await this.healthAggregator.collectHealth();
            healingActions = this.selfHealer.evaluate(healthReport);
        }
        const durationMs = Math.round(performance.now() - startMs);
        this.eventBus.emit('TICK_COMPLETED', {
            tickNumber: currentTick,
            tasksProcessed: processed,
            durationMs
        });
        return {
            tickNumber: currentTick,
            tasksProcessed: processed,
            results,
            healthReport,
            healingActions,
            scheduledFired,
            durationMs
        };
    }
    isRunning() {
        return this.running;
    }
    getTickNumber() {
        return this.tickNumber;
    }
    async runLoop(signal) {
        while (!signal.aborted) {
            await this.executeTick();
            await this.sleep(this.config.tickIntervalMs, signal);
        }
    }
    sleep(ms, signal) {
        return new Promise((resolve) => {
            if (signal.aborted) {
                resolve();
                return;
            }
            const timer = setTimeout(resolve, ms);
            const onAbort = () => {
                clearTimeout(timer);
                resolve();
            };
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }
}
