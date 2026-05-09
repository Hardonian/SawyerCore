import { v4 as uuidv4 } from 'uuid';
const queue = [];
export function enqueueTask(type, payload, traceId) {
    const task = {
        id: uuidv4(),
        type,
        payload,
        createdAt: Date.now(),
        status: 'PENDING',
        retryCount: 0,
        traceId
    };
    queue.push(task);
    return task;
}
export function getPendingTasks() {
    return queue.filter(t => t.status === 'PENDING');
}
export function updateTaskStatus(id, status, _error) {
    const task = queue.find(t => t.id === id);
    if (task) {
        task.status = status;
        if (status === 'FAILED') {
            task.retryCount++;
        }
    }
}
export function removeTask(id) {
    const index = queue.findIndex(t => t.id === id);
    if (index !== -1) {
        queue.splice(index, 1);
    }
}
export function clearQueue() {
    queue.length = 0;
}
