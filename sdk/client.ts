/**
 * SawyerCore Enterprise Client SDK
 * Production-ready client library with typed namespaces, retry policies, and truthful error handling.
 */

import {
  TaskInput,
  TaskResult,
  ProviderInfo,
  EngineStatus,
  ApiKey,
  CreateApiKeyOptions,
  AgentConfig,
  CreateAgentOptions,
  ShareableOutput,
  CreateShareOptions,
  MeResponse,
  SawyerClientOptions,
} from './types.js';

export class SawyerError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown,
    public traceId?: string
  ) {
    super(message);
    this.name = 'SawyerError';
  }
}

export class AuthenticationError extends SawyerError {
  constructor(message: string = 'Authentication failed: Invalid or missing API key') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class QuotaExceededError extends SawyerError {
  constructor(message: string, details?: unknown) {
    super(message, 429, details);
    this.name = 'QuotaExceededError';
  }
}

export class ServiceDegradedError extends SawyerError {
  constructor(message: string, public degradedState: string, details?: unknown) {
    super(message, 503, details);
    this.name = 'ServiceDegradedError';
  }
}

export class NotFoundError extends SawyerError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class SawyerClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly extraHeaders: Record<string, string>;

  public readonly tasks: TasksNamespace;
  public readonly providers: ProvidersNamespace;
  public readonly agents: AgentsNamespace;
  public readonly shares: SharesNamespace;
  public readonly apiKeys: ApiKeysNamespace;

  constructor(options: SawyerClientOptions | string) {
    if (typeof options === 'string') {
      this.apiKey = options;
      this.endpoint = 'http://127.0.0.1:8787';
      this.timeoutMs = 30_000;
      this.maxRetries = 2;
      this.extraHeaders = {};
    } else {
      this.apiKey = options.apiKey;
      this.endpoint = (options.endpoint || 'http://127.0.0.1:8787').replace(/\/+$/, '');
      this.timeoutMs = options.timeoutMs ?? 30_000;
      this.maxRetries = options.maxRetries ?? 2;
      this.extraHeaders = options.headers ?? {};
    }

    this.tasks = new TasksNamespace(this);
    this.providers = new ProvidersNamespace(this);
    this.agents = new AgentsNamespace(this);
    this.shares = new SharesNamespace(this);
    this.apiKeys = new ApiKeysNamespace(this);
  }

  /**
   * Internal HTTP request helper with timeout and retry logic.
   */
  async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
      body?: unknown;
      headers?: Record<string, string>;
      skipAuth?: boolean;
    } = {}
  ): Promise<T> {
    const url = `${this.endpoint}${path.startsWith('/') ? path : `/${path}`}`;
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
      ...options.headers,
    };

    if (!options.skipAuth && this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    let lastError: Error | null = null;
    const maxAttempts = method === 'GET' ? this.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorPayload: any = {};
          try {
            errorPayload = await response.json();
          } catch {
            errorPayload = { error: await response.text() };
          }

          const message = errorPayload.error || errorPayload.message || `HTTP ${response.status}: ${response.statusText}`;

          if (response.status === 401) {
            throw new AuthenticationError(message);
          }
          if (response.status === 404) {
            throw new NotFoundError(path);
          }
          if (response.status === 429) {
            throw new QuotaExceededError(message, errorPayload.details);
          }
          if (response.status === 503) {
            throw new ServiceDegradedError(message, errorPayload.degradedState || 'MODEL_UNAVAILABLE', errorPayload);
          }

          throw new SawyerError(message, response.status, errorPayload);
        }

        return (await response.json()) as T;
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err instanceof SawyerError && err.statusCode && err.statusCode < 500) {
          // Client errors (4xx) should not be retried
          throw err;
        }

        if (attempt < maxAttempts) {
          const backoff = Math.min(100 * Math.pow(2, attempt), 1000);
          await new Promise((res) => setTimeout(res, backoff));
        }
      }
    }

    throw lastError || new SawyerError('Request failed');
  }

  /**
   * Check API health status.
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('/api/health', { skipAuth: true });
  }

  /**
   * Get engine runtime status.
   */
  async status(): Promise<EngineStatus> {
    return this.request<EngineStatus>('/api/status');
  }

  /**
   * Get authenticated tenant metadata, resource quota, and billing summary.
   */
  async me(): Promise<MeResponse> {
    return this.request<MeResponse>('/api/me');
  }

  /**
   * Direct task execution convenience shortcut.
   */
  async runTask<T = unknown>(input: TaskInput): Promise<TaskResult<T>> {
    return this.tasks.run<T>(input);
  }
}

/**
 * Task Execution Namespace
 */
export class TasksNamespace {
  constructor(private client: SawyerClient) {}

  /**
   * Execute an AI task synchronously with deterministic routing.
   */
  async run<T = unknown>(input: TaskInput): Promise<TaskResult<T>> {
    return this.client.request<TaskResult<T>>('/api/tasks', {
      method: 'POST',
      body: input,
    });
  }

  /**
   * Helper to run a basic prompt task.
   */
  async prompt<T = string>(promptText: string, model?: string): Promise<TaskResult<T>> {
    return this.run<T>({
      type: 'chat',
      input: promptText,
      model,
    });
  }
}

/**
 * Providers Namespace
 */
export class ProvidersNamespace {
  constructor(private client: SawyerClient) {}

  /**
   * List all available local and remote providers.
   */
  async list(): Promise<ProviderInfo[]> {
    const res = await this.client.request<{ providers: ProviderInfo[] }>('/api/providers');
    return res.providers;
  }
}

/**
 * Agents Namespace
 */
export class AgentsNamespace {
  constructor(private client: SawyerClient) {}

  async create(options: CreateAgentOptions): Promise<AgentConfig> {
    return this.client.request<AgentConfig>('/api/agents', {
      method: 'POST',
      body: options,
    });
  }

  async list(): Promise<AgentConfig[]> {
    return this.client.request<AgentConfig[]>('/api/agents');
  }

  async get(id: string): Promise<AgentConfig> {
    return this.client.request<AgentConfig>(`/api/agents/${id}`);
  }

  async update(id: string, updates: Partial<CreateAgentOptions>): Promise<AgentConfig> {
    return this.client.request<AgentConfig>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request<{ deleted: boolean }>(`/api/agents/${id}`, {
      method: 'DELETE',
    });
  }
}

/**
 * Shares Namespace
 */
export class SharesNamespace {
  constructor(private client: SawyerClient) {}

  async create(options: CreateShareOptions): Promise<ShareableOutput> {
    return this.client.request<ShareableOutput>('/api/share', {
      method: 'POST',
      body: options,
    });
  }

  async get(id: string, password?: string): Promise<ShareableOutput> {
    const headers: Record<string, string> = {};
    if (password) {
      headers['x-share-password'] = password;
    }
    return this.client.request<ShareableOutput>(`/api/share/${id}`, {
      skipAuth: true,
      headers,
    });
  }

  async listMine(): Promise<ShareableOutput[]> {
    return this.client.request<ShareableOutput[]>('/api/my-shares');
  }
}

/**
 * API Keys Namespace
 */
export class ApiKeysNamespace {
  constructor(private client: SawyerClient) {}

  async create(options: CreateApiKeyOptions): Promise<{ key: string; apiKey: ApiKey }> {
    return this.client.request<{ key: string; apiKey: ApiKey }>('/api/api-keys', {
      method: 'POST',
      body: options,
    });
  }

  async list(): Promise<ApiKey[]> {
    return this.client.request<ApiKey[]>('/api/api-keys');
  }

  async revoke(id: string): Promise<{ revoked: boolean }> {
    return this.client.request<{ revoked: boolean }>(`/api/api-keys/${id}`, {
      method: 'DELETE',
    });
  }
}
