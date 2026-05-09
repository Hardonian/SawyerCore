/**
 * Self-healer — automated failure detection, retry, reroute, downgrade.
 * Decision strategy:
 *   MODEL_UNAVAILABLE → REROUTE (try alternative signals)
 *   LOW_MEMORY        → DOWNGRADE (scale model tier down)
 *   PARTIAL_EXECUTION → RETRY (same params, hope for transient fix)
 *   PROVIDER_DOWN      → REROUTE (skip that provider)
 *
 * After maxHealAttempts per target, marks the target as exhausted and skips.
 * All actions flow through the event bus for observability.
 */
const DEFAULT_HEALER_CONFIG = {
    maxHealAttemptsPerTarget: 3,
    successRateDegradedThreshold: 0.7,
    successRateCriticalThreshold: 0.3,
    providerHealthyMinimum: 1
};
export class SelfHealer {
    config;
    eventBus;
    systemState;
    trackers = new Map();
    actionLog = [];
    constructor(eventBus, systemState, config = {}) {
        this.config = { ...DEFAULT_HEALER_CONFIG, ...config };
        this.eventBus = eventBus;
        this.systemState = systemState;
    }
    evaluate(report) {
        const actions = [];
        this.evaluateProviders(report, actions);
        this.evaluateResources(report, actions);
        this.evaluateSuccessRate(report, actions);
        this.updateSystemState(report, actions);
        for (const action of actions) {
            this.actionLog.push(action);
        }
        return actions;
    }
    getActionLog() {
        return this.actionLog;
    }
    resetTracker(target) {
        this.trackers.delete(target);
    }
    resetAllTrackers() {
        this.trackers.clear();
    }
    evaluateProviders(report, actions) {
        for (const provider of report.providers) {
            if (provider.healthy) {
                const tracker = this.trackers.get(provider.name);
                if (tracker && tracker.exhausted) {
                    this.trackers.delete(provider.name);
                    this.eventBus.emit('PROVIDER_RECOVERED', { provider: provider.name });
                }
                continue;
            }
            const tracker = this.getOrCreateTracker(provider.name);
            if (tracker.exhausted)
                continue;
            tracker.attempts++;
            const action = this.decideAction('PROVIDER_DOWN', provider.name, tracker);
            actions.push(action);
            this.eventBus.emit('HEALING_TRIGGERED', {
                failureType: 'PROVIDER_DOWN',
                target: provider.name,
                action: action.action
            });
            if (tracker.attempts >= this.config.maxHealAttemptsPerTarget) {
                tracker.exhausted = true;
                this.eventBus.emit('PROVIDER_DEGRADED', {
                    provider: provider.name,
                    reason: `exhausted ${this.config.maxHealAttemptsPerTarget} healing attempts`
                });
            }
        }
    }
    evaluateResources(report, actions) {
        if (report.resource.memoryPressure === 'HARD_LIMIT') {
            const tracker = this.getOrCreateTracker('memory');
            if (tracker.exhausted)
                return;
            tracker.attempts++;
            const action = {
                failureType: 'LOW_MEMORY',
                target: 'memory',
                action: 'DOWNGRADE',
                reason: 'hard memory limit exceeded; model tier downgrade required',
                success: true
            };
            actions.push(action);
            this.eventBus.emit('HEALING_TRIGGERED', {
                failureType: 'LOW_MEMORY',
                target: 'memory',
                action: 'DOWNGRADE'
            });
            this.eventBus.emit('RESOURCE_ALERT', {
                metric: 'memory_rss',
                value: report.resource.snapshot.rssBytes,
                threshold: report.resource.snapshot.memoryTotalBytes,
                severity: 'critical'
            });
            if (tracker.attempts >= this.config.maxHealAttemptsPerTarget) {
                tracker.exhausted = true;
            }
        }
        else if (report.resource.memoryPressure === 'SOFT_LIMIT') {
            this.eventBus.emit('RESOURCE_ALERT', {
                metric: 'memory_rss',
                value: report.resource.snapshot.rssBytes,
                threshold: report.resource.snapshot.memoryTotalBytes,
                severity: 'warning'
            });
        }
    }
    evaluateSuccessRate(report, actions) {
        if (report.recentSuccessCount + report.recentFailureCount < 5)
            return;
        if (report.successRate < this.config.successRateCriticalThreshold) {
            const tracker = this.getOrCreateTracker('success-rate');
            if (tracker.exhausted)
                return;
            tracker.attempts++;
            actions.push({
                failureType: 'PARTIAL_EXECUTION',
                target: 'success-rate',
                action: 'DOWNGRADE',
                reason: `success rate ${(report.successRate * 100).toFixed(1)}% below critical threshold ${this.config.successRateCriticalThreshold * 100}%`,
                success: true
            });
            if (tracker.attempts >= this.config.maxHealAttemptsPerTarget) {
                tracker.exhausted = true;
            }
        }
    }
    updateSystemState(report, actions) {
        const current = this.systemState.state;
        if (current === 'STOPPED')
            return;
        const hasProviderFailures = report.providers.some((p) => !p.healthy);
        const isMemoryConstrained = report.resource.memoryPressure !== 'NOMINAL';
        const isLowSuccessRate = report.successRate < this.config.successRateDegradedThreshold;
        const isCriticalSuccessRate = report.successRate < this.config.successRateCriticalThreshold;
        const noHealthyProviders = report.healthyProviderCount < this.config.providerHealthyMinimum;
        if (isCriticalSuccessRate || noHealthyProviders) {
            if (current !== 'CRITICAL' && this.systemState.canTransition('CRITICAL')) {
                const reason = noHealthyProviders
                    ? `healthy providers (${report.healthyProviderCount}) below minimum (${this.config.providerHealthyMinimum})`
                    : `success rate ${(report.successRate * 100).toFixed(1)}% below critical threshold`;
                this.systemState.transition('CRITICAL', reason);
            }
        }
        else if (hasProviderFailures || isMemoryConstrained || isLowSuccessRate) {
            if (current === 'NOMINAL' && this.systemState.canTransition('DEGRADED')) {
                const reasons = [];
                if (hasProviderFailures)
                    reasons.push('provider failures detected');
                if (isMemoryConstrained)
                    reasons.push(`memory pressure: ${report.resource.memoryPressure}`);
                if (isLowSuccessRate)
                    reasons.push(`success rate: ${(report.successRate * 100).toFixed(1)}%`);
                this.systemState.transition('DEGRADED', reasons.join('; '));
            }
            if (current === 'RECOVERING' && this.systemState.canTransition('DEGRADED')) {
                this.systemState.transition('DEGRADED', 'recovery incomplete; degraded conditions persist');
            }
        }
        else {
            if (current === 'CRITICAL' && this.systemState.canTransition('RECOVERING')) {
                this.systemState.transition('RECOVERING', 'conditions improving; entering recovery');
            }
            if ((current === 'DEGRADED' || current === 'RECOVERING') && this.systemState.canTransition('NOMINAL')) {
                this.systemState.transition('NOMINAL', 'all subsystems nominal');
                this.resetAllTrackers();
            }
        }
        void actions;
    }
    decideAction(failureType, target, tracker) {
        let action;
        let reason;
        switch (failureType) {
            case 'MODEL_UNAVAILABLE':
                action = tracker.attempts <= 1 ? 'RETRY' : 'REROUTE';
                reason = tracker.attempts <= 1
                    ? `retrying ${target} (attempt ${tracker.attempts})`
                    : `rerouting away from ${target} after ${tracker.attempts} failures`;
                break;
            case 'LOW_MEMORY':
                action = 'DOWNGRADE';
                reason = `downgrading model tier to reduce memory pressure`;
                break;
            case 'PARTIAL_EXECUTION':
                action = tracker.attempts <= 2 ? 'RETRY' : 'SKIP';
                reason = tracker.attempts <= 2
                    ? `retrying partial execution (attempt ${tracker.attempts})`
                    : `skipping after ${tracker.attempts} partial execution failures`;
                break;
            case 'PROVIDER_DOWN':
                action = 'REROUTE';
                reason = `provider ${target} down; rerouting to alternatives`;
                break;
        }
        tracker.lastAction = action;
        return { failureType, target, action, reason, success: true };
    }
    getOrCreateTracker(target) {
        let tracker = this.trackers.get(target);
        if (!tracker) {
            tracker = { attempts: 0, exhausted: false, lastAction: null };
            this.trackers.set(target, tracker);
        }
        return tracker;
    }
}
