export type TaskStatus = 'SUCCESS' | 'FAILURE' | 'DEGRADED' | 'PENDING';

export interface TaskResult<T = any> {
  status: TaskStatus;
  data?: T;
  error?: string;
  reason?: string;
  traceId: string;
}

export interface PluginContext {
  id: string;
  version: string;
  permissions: string[];
}

export interface Capability {
  name: string;
  description: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}
