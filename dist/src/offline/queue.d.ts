export interface QueuedTask {
    id: string;
    type: string;
    payload: any;
    createdAt: number;
    status: 'PENDING' | 'SYNCING' | 'FAILED';
    retryCount: number;
    traceId: string;
}
export declare function enqueueTask(type: string, payload: any, traceId: string): QueuedTask;
export declare function getPendingTasks(): QueuedTask[];
export declare function updateTaskStatus(id: string, status: 'PENDING' | 'SYNCING' | 'FAILED', _error?: string): void;
export declare function removeTask(id: string): void;
export declare function clearQueue(): void;
