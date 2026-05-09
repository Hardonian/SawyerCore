import { TaskResult } from './types.js';

export class SawyerClient {
  constructor(private apiKey: string, private endpoint: string = 'http://localhost:3000') {}

  async invokeTask<T = any>(type: string, payload: any): Promise<TaskResult<T>> {
    try {
      const response = await fetch(`${this.endpoint}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({ type, payload })
      });

      if (!response.ok) {
        return {
          status: 'FAILURE',
          error: `HTTP error ${response.status}`,
          traceId: 'unknown'
        };
      }

      return await response.json();
    } catch (error) {
      return {
        status: 'FAILURE',
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId: 'unknown'
      };
    }
  }
}
