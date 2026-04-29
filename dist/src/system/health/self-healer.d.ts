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
import type { EventBus } from '../events/event-bus.js';
import type { HealingAction } from '../events/event-types.js';
import type { SystemState } from './system-state.js';
import type { SystemHealthReport } from './health-aggregator.js';
export interface SelfHealerConfig {
    maxHealAttemptsPerTarget: number;
    successRateDegradedThreshold: number;
    successRateCriticalThreshold: number;
    providerHealthyMinimum: number;
}
export declare class SelfHealer {
    private readonly config;
    private readonly eventBus;
    private readonly systemState;
    private readonly trackers;
    private readonly actionLog;
    constructor(eventBus: EventBus, systemState: SystemState, config?: Partial<SelfHealerConfig>);
    evaluate(report: SystemHealthReport): HealingAction[];
    getActionLog(): readonly HealingAction[];
    resetTracker(target: string): void;
    resetAllTrackers(): void;
    private evaluateProviders;
    private evaluateResources;
    private evaluateSuccessRate;
    private updateSystemState;
    private decideAction;
    private getOrCreateTracker;
}
