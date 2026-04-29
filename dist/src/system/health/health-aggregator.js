/**
 * Health aggregator — collects truth-based health from all subsystems.
 * No synthetic metrics. Every value is measured or derived from measured values.
 *
 * Subsystems register health probes. The aggregator polls them
 * and produces a SystemHealthReport with deterministic grading.
 */
const DEFAULT_CONFIG = {
    failureWindowSize: 100
};
export class HealthAggregator {
    providers;
    resourceMonitor;
    systemState;
    eventBus;
    config;
    clock;
    startTimeMs = null;
    tickCount = 0;
    resultWindow = [];
    constructor(providers, resourceMonitor, systemState, eventBus, config = {}) {
        this.providers = providers;
        this.resourceMonitor = resourceMonitor;
        this.systemState = systemState;
        this.eventBus = eventBus;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.clock = this.config.clock ?? (() => new Date().toISOString());
    }
    markStarted() {
        this.startTimeMs = performance.now();
    }
    incrementTick() {
        this.tickCount++;
    }
    recordResult(success) {
        this.resultWindow.push(success);
        if (this.resultWindow.length > this.config.failureWindowSize) {
            this.resultWindow.shift();
        }
    }
    async collectHealth() {
        const providerHealth = await this.probeProviders();
        const resource = this.resourceMonitor.assess();
        const healthyCount = providerHealth.filter((p) => p.healthy).length;
        const failures = this.resultWindow.filter((r) => !r).length;
        const successes = this.resultWindow.filter((r) => r).length;
        const total = this.resultWindow.length;
        const successRate = total > 0 ? Number((successes / total).toFixed(4)) : 1;
        const report = {
            state: this.systemState.state,
            uptimeMs: this.startTimeMs !== null ? Math.round(performance.now() - this.startTimeMs) : 0,
            tickCount: this.tickCount,
            providers: providerHealth,
            healthyProviderCount: healthyCount,
            totalProviderCount: this.providers.length,
            resource,
            recentFailureCount: failures,
            recentSuccessCount: successes,
            successRate,
            timestampIso: this.clock()
        };
        this.eventBus.emit('HEALTH_CHECK', {
            state: report.state,
            providerHealth: Object.fromEntries(providerHealth.map((p) => [p.name, p.healthy])),
            memoryPressure: resource.memoryPressure
        });
        return report;
    }
    getTickCount() {
        return this.tickCount;
    }
    async probeProviders() {
        const entries = [];
        for (const provider of this.providers) {
            let health;
            try {
                health = await provider.healthCheck();
            }
            catch (error) {
                health = { healthy: false, reason: error.message };
            }
            entries.push({
                name: provider.name,
                healthy: health.healthy,
                reason: health.reason ?? null
            });
        }
        return entries;
    }
}
