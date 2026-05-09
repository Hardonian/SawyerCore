import { TaskResult } from './types.js';

// The global SAWYER_API is injected by the loader's sandbox
declare const SAWYER_API: {
  id: string;
  version: string;
  invokeTask: (type: string, payload: any) => Promise<TaskResult>;
};

export const SawyerPlugin = {
  get id() { return SAWYER_API.id; },
  get version() { return SAWYER_API.version; },
  
  async invokeTask(type: string, payload: any): Promise<TaskResult> {
    return await SAWYER_API.invokeTask(type, payload);
  },

  log(message: string) {
    console.log(message);
  },

  error(message: string) {
    console.error(message);
  }
};
