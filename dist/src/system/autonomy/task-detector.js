/**
 * Task detector — manages the work queue for autonomous operation.
 * Detects pending tasks, prioritizes, dequeues for processing.
 * Uses monotonic sequence numbers for deterministic ordering.
 */
import { createHash } from 'node:crypto';
const DEFAULT_CONFIG = {
    maxQueueSize: 500,
    maxAttemptsDefault: 3
};
const PRIORITY_ORDER = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3
};
export class TaskDetector {
    queue = [];
    config;
    eventBus;
    sequenceCounter = 0;
    constructor(eventBus, config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.eventBus = eventBus;
    }
    enqueue(intent, priority = 'NORMAL', maxAttempts) {
        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error(`TaskDetector: queue full (${this.config.maxQueueSize})`);
        }
        const sequence = this.sequenceCounter++;
        const id = createHash('sha256')
            .update(`${intent}:${sequence}`)
            .digest('hex')
            .slice(0, 16);
        const item = {
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
    dequeue() {
        const index = this.queue.findIndex((item) => item.status === 'PENDING');
        if (index < 0)
            return null;
        return this.queue[index];
    }
    dequeueAll() {
        return this.queue.filter((item) => item.status === 'PENDING');
    }
    markRunning(id) {
        const item = this.findById(id);
        if (!item || item.status !== 'PENDING')
            return false;
        item.status = 'RUNNING';
        item.attempts++;
        this.eventBus.emit('TASK_STARTED', {
            workItemId: id,
            taskId: `task:${id}:${item.attempts}`
        });
        return true;
    }
    markCompleted(id, result) {
        const item = this.findById(id);
        if (!item)
            return false;
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
    markFailed(id, error) {
        const item = this.findById(id);
        if (!item)
            return false;
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
        }
        else {
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
    pendingCount() {
        return this.queue.filter((item) => item.status === 'PENDING').length;
    }
    totalCount() {
        return this.queue.length;
    }
    findById(id) {
        return this.queue.find((item) => item.id === id);
    }
    getStats() {
        const counts = {
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
    sortQueue() {
        this.queue.sort((a, b) => {
            if (a.status !== b.status) {
                if (a.status === 'PENDING' && b.status !== 'PENDING')
                    return -1;
                if (b.status === 'PENDING' && a.status !== 'PENDING')
                    return 1;
            }
            const pa = PRIORITY_ORDER[a.priority];
            const pb = PRIORITY_ORDER[b.priority];
            if (pa !== pb)
                return pa - pb;
            return a.createdSequence - b.createdSequence;
        });
    }
}
