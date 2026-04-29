/**
 * Health aggregator — collects truth-based health from all subsystems.
 * No synthetic metrics. Every value is measured or derived from measured values.
 *
 * Subsystems register health probes. The aggregator polls them
 * and produces a SystemHealthReport with deterministic grading.
 */
import type { ResourceMonitor, ResourceAssessment } from '../../runtime/safety/resource-monitor.js';
import type { RuntimeProvider } from '../../providers/provider.js';
import type { EventBus } from '../events/event-bus.js';
import type { SystemStateName } from '../events/event-types.js';
import type { SystemState } from './system-state.js';
export interface ProviderHealthEntry {
    name: string;
    healthy: boolean;
    reason: string | null;
}
export interface SystemHealthReport {
    readonly state: SystemStateName;
    readonly uptimeMs: number;
    readonly tickCount: number;
    readonly providers: readonly ProviderHealthEntry[];
    readonly healthyProviderCount: number;
    readonly totalProviderCount: number;
    readonly resource: ResourceAssessment;
    readonly recentFailureCount: number;
    readonly recentSuccessCount: number;
    readonly successRate: number;
    readonly timestampIso: string;
}
export interface HealthAggregatorConfig {
    failureWindowSize: number;
    clock?: () => string;
}
export declare class HealthAggregator {
    private readonly providers;
    private readonly resourceMonitor;
    private readonly systemState;
    private readonly eventBus;
    private readonly config;
    private readonly clock;
    private startTimeMs;
    private tickCount;
    private readonly resultWindow;
    constructor(providers: RuntimeProvider[], resourceMonitor: ResourceMonitor, systemState: SystemState, eventBus: EventBus, config?: Partial<HealthAggregatorConfig>);
    markStarted(): void;
    incrementTick(): void;
    recordResult(success: boolean): void;
    collectHealth(): Promise<SystemHealthReport>;
    getTickCount(): number;
    private probeProviders;
}
