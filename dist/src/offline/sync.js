import { getPendingTasks, updateTaskStatus, removeTask } from './queue.js';
import { updateOfflineStats, markSynced } from './state.js';
export class OfflineSync {
    handlers = new Map();
    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }
    async sync() {
        const tasks = getPendingTasks();
        if (tasks.length === 0)
            return { success: 0, failed: 0 };
        updateOfflineStats(tasks.length, true);
        let successCount = 0;
        let failedCount = 0;
        for (const task of tasks) {
            const handler = this.handlers.get(task.type);
            if (!handler) {
                console.error(`No sync handler for task type: ${task.type}`);
                updateTaskStatus(task.id, 'FAILED');
                failedCount++;
                continue;
            }
            try {
                updateTaskStatus(task.id, 'SYNCING');
                const success = await handler(task);
                if (success) {
                    removeTask(task.id);
                    successCount++;
                }
                else {
                    updateTaskStatus(task.id, 'FAILED');
                    failedCount++;
                }
            }
            catch (error) {
                console.error(`Sync failed for task ${task.id}:`, error);
                updateTaskStatus(task.id, 'FAILED');
                failedCount++;
            }
        }
        if (failedCount === 0) {
            markSynced();
        }
        else {
            updateOfflineStats(getPendingTasks().length, false);
        }
        return { success: successCount, failed: failedCount };
    }
}
