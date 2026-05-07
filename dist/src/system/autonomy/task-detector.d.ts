/**
 * Task detector — manages the work queue for autonomous operation.
 * Detects pending tasks, prioritizes, dequeues for processing.
 * Uses monotonic sequence numbers for deterministic ordering.
 */
import type { EventBus } from '../events/event-bus.js';
import type { WorkItem, WorkItemPriority, WorkItemResult } from '../events/event-types.js';
export interface TaskDetectorConfig {
    maxQueueSize: number;
    maxAttemptsDefault: number;
}
export declare class TaskDetector {
    private readonly queue;
    private readonly config;
    private readonly eventBus;
    private sequenceCounter;
    constructor(eventBus: EventBus, config?: Partial<TaskDetectorConfig>);
    enqueue(intent: string, priority?: WorkItemPriority, maxAttempts?: number): WorkItem;
    dequeue(): WorkItem | null;
    dequeueAll(): WorkItem[];
    markRunning(id: string): boolean;
    markCompleted(id: string, result: WorkItemResult): boolean;
    markFailed(id: string, error: string): boolean;
    pendingCount(): number;
    totalCount(): number;
    findById(id: string): WorkItem | undefined;
    getStats(): {
        pending: number;
        running: number;
        completed: number;
        failed: number;
        retrying: number;
        total: number;
    };
    private sortQueue;
}
