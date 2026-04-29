/**
 * System event type definitions.
 * Every event is typed, carries a deterministic ID,
 * and uses monotonic sequence numbers for ordering.
 */
import type { DegradedStateCode } from '../../runtime/core/execution-log.js';
export type SystemEventType = 'SYSTEM_STARTED' | 'SYSTEM_STOPPED' | 'TICK_COMPLETED' | 'TASK_ENQUEUED' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_FAILED' | 'TASK_RETRIED' | 'HEALTH_CHECK' | 'STATE_TRANSITION' | 'HEALING_TRIGGERED' | 'HEALING_COMPLETED' | 'SCHEDULE_FIRED' | 'PROVIDER_DEGRADED' | 'PROVIDER_RECOVERED' | 'RESOURCE_ALERT';
export interface SystemEvent<T extends SystemEventType = SystemEventType> {
    readonly type: T;
    readonly sequence: number;
    readonly timestampIso: string;
    readonly payload: SystemEventPayloadMap[T];
}
export interface SystemEventPayloadMap {
    SYSTEM_STARTED: {
        tickIntervalMs: number;
        providers: string[];
    };
    SYSTEM_STOPPED: {
        reason: string;
        uptimeMs: number;
    };
    TICK_COMPLETED: {
        tickNumber: number;
        tasksProcessed: number;
        durationMs: number;
    };
    TASK_ENQUEUED: {
        workItemId: string;
        intent: string;
        priority: WorkItemPriority;
    };
    TASK_STARTED: {
        workItemId: string;
        taskId: string;
    };
    TASK_COMPLETED: {
        workItemId: string;
        taskId: string;
        runId: string;
        degradedState: DegradedStateCode;
    };
    TASK_FAILED: {
        workItemId: string;
        taskId: string;
        error: string;
        retriesRemaining: number;
    };
    TASK_RETRIED: {
        workItemId: string;
        taskId: string;
        attempt: number;
        reason: string;
    };
    HEALTH_CHECK: {
        state: SystemStateName;
        providerHealth: Record<string, boolean>;
        memoryPressure: string;
    };
    STATE_TRANSITION: {
        from: SystemStateName;
        to: SystemStateName;
        reason: string;
    };
    HEALING_TRIGGERED: {
        failureType: HealingFailureType;
        target: string;
        action: HealingActionType;
    };
    HEALING_COMPLETED: {
        target: string;
        action: HealingActionType;
        success: boolean;
        reason: string;
    };
    SCHEDULE_FIRED: {
        scheduleId: string;
        name: string;
    };
    PROVIDER_DEGRADED: {
        provider: string;
        reason: string;
    };
    PROVIDER_RECOVERED: {
        provider: string;
    };
    RESOURCE_ALERT: {
        metric: string;
        value: number;
        threshold: number;
        severity: 'warning' | 'critical';
    };
}
export type SystemStateName = 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'RECOVERING' | 'STOPPED';
export type WorkItemPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type WorkItemStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
export interface WorkItem {
    readonly id: string;
    readonly intent: string;
    readonly priority: WorkItemPriority;
    status: WorkItemStatus;
    readonly createdSequence: number;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    result: WorkItemResult | null;
}
export interface WorkItemResult {
    runId: string;
    decision: string;
    degradedState: DegradedStateCode;
    latencyMs: number;
}
export type HealingFailureType = 'MODEL_UNAVAILABLE' | 'LOW_MEMORY' | 'PARTIAL_EXECUTION' | 'PROVIDER_DOWN';
export type HealingActionType = 'RETRY' | 'REROUTE' | 'DOWNGRADE' | 'SKIP';
export interface HealingAction {
    readonly failureType: HealingFailureType;
    readonly target: string;
    readonly action: HealingActionType;
    readonly reason: string;
    readonly success: boolean;
}
