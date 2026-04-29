/**
 * Autonomy loop — the 24/7 main controller.
 * Coordinates task detection, workflow execution, health checks,
 * self-healing, and scheduled triggers in a single controlled loop.
 *
 * Uses AbortController for clean shutdown — no dangling timers.
 * Each tick is a complete cycle: detect → execute → heal → report.
 */
import type { WorkflowOrchestrator, WorkflowResult } from './workflow-orchestrator.js';
import type { TaskDetector } from './task-detector.js';
import type { HealthAggregator, SystemHealthReport } from '../health/health-aggregator.js';
import type { SelfHealer } from '../health/self-healer.js';
import type { SystemState } from '../health/system-state.js';
import type { EventBus } from '../events/event-bus.js';
import type { ScheduleRegistry } from '../events/schedule-registry.js';
import type { HealingAction } from '../events/event-types.js';
export interface AutonomyLoopConfig {
    tickIntervalMs: number;
    maxTasksPerTick: number;
    healthCheckIntervalTicks: number;
    providerNames: string[];
}
export interface TickReport {
    tickNumber: number;
    tasksProcessed: number;
    results: WorkflowResult[];
    healthReport: SystemHealthReport | null;
    healingActions: HealingAction[];
    scheduledFired: string[];
    durationMs: number;
}
export declare class AutonomyLoop {
    private readonly orchestrator;
    private readonly taskDetector;
    private readonly healthAggregator;
    private readonly selfHealer;
    private readonly systemState;
    private readonly eventBus;
    private readonly scheduleRegistry;
    private readonly config;
    private running;
    private tickNumber;
    private abortController;
    constructor(orchestrator: WorkflowOrchestrator, taskDetector: TaskDetector, healthAggregator: HealthAggregator, selfHealer: SelfHealer, systemState: SystemState, eventBus: EventBus, scheduleRegistry: ScheduleRegistry, config?: Partial<AutonomyLoopConfig>);
    start(): Promise<void>;
    stop(reason?: string): void;
    executeTick(): Promise<TickReport>;
    isRunning(): boolean;
    getTickNumber(): number;
    private runLoop;
    private sleep;
}
