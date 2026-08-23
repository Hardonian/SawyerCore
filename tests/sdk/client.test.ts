import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SawyerClient,
  AuthenticationError,
  QuotaExceededError,
  ServiceDegradedError,
  NotFoundError,
  SawyerError,
} from '../../sdk/index.js';

describe('SawyerCore TypeScript SDK Client', () => {
  let client: SawyerClient;

  beforeEach(() => {
    client = new SawyerClient({
      apiKey: 'test-api-key',
      endpoint: 'http://127.0.0.1:8787',
      maxRetries: 0,
    });
  });

  describe('Initialization & Configuration', () => {
    it('initializes with string api key and default endpoint', () => {
      const c = new SawyerClient('my-key');
      expect(c).toBeInstanceOf(SawyerClient);
      expect(c.tasks).toBeDefined();
      expect(c.providers).toBeDefined();
      expect(c.agents).toBeDefined();
      expect(c.shares).toBeDefined();
      expect(c.apiKeys).toBeDefined();
    });

    it('initializes with custom options', () => {
      const c = new SawyerClient({
        apiKey: 'custom-key',
        endpoint: 'http://localhost:9000/',
        timeoutMs: 5000,
        maxRetries: 3,
        headers: { 'X-Custom': 'value' },
      });
      expect(c).toBeInstanceOf(SawyerClient);
    });
  });

  describe('Error Mapping', () => {
    it('maps 401 response to AuthenticationError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      } as any);

      await expect(client.status()).rejects.toThrow(AuthenticationError);
    });

    it('maps 404 response to NotFoundError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Resource not found' }),
      } as any);

      await expect(client.agents.get('missing-id')).rejects.toThrow(NotFoundError);
    });

    it('maps 429 response to QuotaExceededError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: 'Monthly quota exceeded', details: 'Limit: 1000' }),
      } as any);

      await expect(
        client.tasks.run({ type: 'chat', input: 'hello' })
      ).rejects.toThrow(QuotaExceededError);
    });

    it('maps 503 response to ServiceDegradedError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({
          error: 'Model provider offline',
          degradedState: 'MODEL_UNAVAILABLE',
        }),
      } as any);

      try {
        await client.tasks.run({ type: 'chat', input: 'test' });
        expect.fail('Should have thrown ServiceDegradedError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ServiceDegradedError);
        expect(err.degradedState).toBe('MODEL_UNAVAILABLE');
      }
    });

    it('maps other errors to SawyerError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        json: async () => ({ error: 'Database error' }),
      } as any);

      await expect(client.me()).rejects.toThrow(SawyerError);
    });
  });

  describe('Namespaces & Methods', () => {
    it('executes tasks.run successfully', async () => {
      const mockResult = {
        id: 'task_1',
        tenantId: 'tenant_a',
        runId: 'run_1',
        output: 'Hello world response',
        provider: 'vLLM',
        latencyMs: 50,
        costUsd: 0.0,
        degradedState: 'NOMINAL',
        timestamp: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      } as any);

      const result = await client.tasks.run({ type: 'chat', input: 'hello' });
      expect(result.output).toBe('Hello world response');
      expect(result.provider).toBe('vLLM');
    });

    it('executes tasks.prompt shortcut', async () => {
      const mockResult = {
        id: 'task_2',
        tenantId: 'tenant_a',
        runId: 'run_2',
        output: 'Prompt answer',
        provider: 'local',
        latencyMs: 30,
        costUsd: 0.0,
        degradedState: 'NOMINAL',
        timestamp: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResult,
      } as any);

      const result = await client.tasks.prompt('What is 2+2?');
      expect(result.output).toBe('Prompt answer');
    });

    it('fetches providers.list', async () => {
      const mockProviders = [
        {
          name: 'vLLM',
          tier: 'LOCAL_BALANCED',
          modelId: 'qwen',
          contextWindow: 4096,
          costPer1kTokens: 0.0,
          available: true,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: mockProviders }),
      } as any);

      const providers = await client.providers.list();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('vLLM');
    });

    it('performs agent CRUD operations', async () => {
      const mockAgent = {
        id: 'agent_1',
        tenantId: 'tenant_a',
        name: 'Test Agent',
        steps: [{ type: 'llm', config: {} }],
        triggers: ['manual'],
        enabled: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAgent,
      } as any);

      const created = await client.agents.create({
        name: 'Test Agent',
        steps: [{ type: 'llm', config: {} }],
        triggers: ['manual'],
      });
      expect(created.id).toBe('agent_1');

      const fetched = await client.agents.get('agent_1');
      expect(fetched.name).toBe('Test Agent');
    });

    it('creates and retrieves shareable outputs', async () => {
      const mockShare = {
        id: 'share_1',
        tenantId: 'tenant_a',
        runId: 'run_1',
        title: 'Report',
        content: { summary: 'Passed' },
        publicUrl: 'http://127.0.0.1:8787/api/share/share_1',
        createdAt: new Date().toISOString(),
        views: 0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockShare,
      } as any);

      const created = await client.shares.create({
        runId: 'run_1',
        title: 'Report',
        content: { summary: 'Passed' },
      });
      expect(created.id).toBe('share_1');

      const retrieved = await client.shares.get('share_1');
      expect(retrieved.title).toBe('Report');
    });

    it('creates and revokes API keys', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          key: 'sk_live_123',
          apiKey: { id: 'key_1', name: 'prod', scopes: ['tasks:read'] },
        }),
      } as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ revoked: true }),
      } as any);

      const { key, apiKey } = await client.apiKeys.create({
        name: 'prod',
        scopes: ['tasks:read'],
      });
      expect(key).toBe('sk_live_123');
      expect(apiKey.name).toBe('prod');

      const revoked = await client.apiKeys.revoke('key_1');
      expect(revoked.revoked).toBe(true);
    });
  });
});
