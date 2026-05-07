/**
 * Task detector — manages the work queue for autonomous operation.
 * Detects pending tasks, prioritizes, dequeues for processing.
 * Uses monotonic sequence numbers for deterministic ordering.
 */

import { createHash } from 'node:crypto';
import type { EventBus } from '../events/event-bus.js';
import type {
  WorkItem,
  WorkItemPriority,
  WorkItemResult,
  WorkItemStatus
} from '../events/event-types.js';

export interface TaskDetectorConfig {
  maxQueueSize: number;
  maxAttemptsDefault: number;
}

const DEFAULT_CONFIG: TaskDetectorConfig = {
  maxQueueSize: 500,
  maxAttemptsDefault: 3
};

const PRIORITY_ORDER: Record<WorkItemPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

export class TaskDetector {
  private readonly queue: WorkItem[] = [];
  private readonly config: TaskDetectorConfig;
  private readonly eventBus: EventBus;
  private sequenceCounter = 0;

  constructor(eventBus: EventBus, config: Partial<TaskDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus;
  }

  enqueue(intent: string, priority: WorkItemPriority = 'NORMAL', maxAttempts?: number): WorkItem {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error(`TaskDetector: queue full (${this.config.maxQueueSize})`);
    }

    const sequence = this.sequenceCounter++;
    const id = createHash('sha256')
      .update(`${intent}:${sequence}`)
      .digest('hex')
      .slice(0, 16);

    const item: WorkItem = {
      id,
      intent,
      priority,
      status: 'PENDING',
      createdSequence: sequence,
      attempts: 0,
      maxAttempts: maxAttempts ?? this.config.maxAttemptsDefault,
      lastError: null,
      result: null
    };

    this.queue.push(item);
    this.sortQueue();

    this.eventBus.emit('TASK_ENQUEUED', {
      workItemId: id,
      intent,
      priority
    });

    return item;
  }

  dequeue(): WorkItem | null {
    const index = this.queue.findIndex((item) => item.status === 'PENDING');
    if (index < 0) return null;
    return this.queue[index];
  }

  dequeueAll(): WorkItem[] {
    return this.queue.filter((item) => item.status === 'PENDING');
  }

  markRunning(id: string): boolean {
    const item = this.findById(id);
    if (!item || item.status !== 'PENDING') return false;
    item.status = 'RUNNING';
    item.attempts++;
    this.eventBus.emit('TASK_STARTED', {
      workItemId: id,
      taskId: `task:${id}:${item.attempts}`
    });
    return true;
  }

  markCompleted(id: string, result: WorkItemResult): boolean {
    const item = this.findById(id);
    if (!item) return false;
    item.status = 'COMPLETED';
    item.result = result;
    this.eventBus.emit('TASK_COMPLETED', {
      workItemId: id,
      taskId: `task:${id}:${item.attempts}`,
      runId: result.runId,
      degradedState: result.degradedState
    });
    return true;
  }

  markFailed(id: string, error: string): boolean {
    const item = this.findById(id);
    if (!item) return false;

    item.lastError = error;

    if (item.attempts < item.maxAttempts) {
      item.status = 'RETRYING';
      this.eventBus.emit('TASK_RETRIED', {
        workItemId: id,
        taskId: `task:${id}:${item.attempts}`,
        attempt: item.attempts,
        reason: error
      });
      item.status = 'PENDING';
    } else {
      item.status = 'FAILED';
      this.eventBus.emit('TASK_FAILED', {
        workItemId: id,
        taskId: `task:${id}:${item.attempts}`,
        error,
        retriesRemaining: 0
      });
    }

    return true;
  }

  pendingCount(): number {
    return this.queue.filter((item) => item.status === 'PENDING').length;
  }

  totalCount(): number {
    return this.queue.length;
  }

  findById(id: string): WorkItem | undefined {
    return this.queue.find((item) => item.id === id);
  }

  getStats(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    retrying: number;
    total: number;
  } {
    const counts: Record<WorkItemStatus, number> = {
      PENDING: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      RETRYING: 0
    };
    for (const item of this.queue) {
      counts[item.status]++;
    }
    return {
      pending: counts.PENDING,
      running: counts.RUNNING,
      completed: counts.COMPLETED,
      failed: counts.FAILED,
      retrying: counts.RETRYING,
      total: this.queue.length
    };
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
      }
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return a.createdSequence - b.createdSequence;
    });
  }
}
