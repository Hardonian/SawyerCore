import { QueuedTask } from './queue.js';
export type SyncHandler = (task: QueuedTask) => Promise<boolean>;
export declare class OfflineSync {
    private handlers;
    registerHandler(type: string, handler: SyncHandler): void;
    sync(): Promise<{
        success: number;
        failed: number;
    }>;
}
