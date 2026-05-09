import { v4 as uuidv4 } from 'uuid';

export interface QueuedTask {
  id: string;
  type: string;
  payload: any;
  createdAt: number;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  traceId: string;
}

const queue: QueuedTask[] = [];

export function enqueueTask(type: string, payload: any, traceId: string): QueuedTask {
  const task: QueuedTask = {
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

export function getPendingTasks(): QueuedTask[] {
  return queue.filter(t => t.status === 'PENDING');
}

export function updateTaskStatus(id: string, status: 'PENDING' | 'SYNCING' | 'FAILED', _error?: string) {
  const task = queue.find(t => t.id === id);
  if (task) {
    task.status = status;
    if (status === 'FAILED') {
      task.retryCount++;
    }
  }
}

export function removeTask(id: string) {
  const index = queue.findIndex(t => t.id === id);
  if (index !== -1) {
    queue.splice(index, 1);
  }
}

export function clearQueue() {
  queue.length = 0;
}
