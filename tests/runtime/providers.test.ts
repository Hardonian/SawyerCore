import { describe, it, expect } from 'vitest';
import { VllmProvider } from '../../src/providers/providers.js';

describe('providers', () => {
  it('probes models endpoint for health', async () => {
    const provider = new VllmProvider(
      { name: 'vllm', endpoint: 'http://localhost:8000/v1', timeoutMs: 1000, retries: 0, enabled: true },
      async () => new Response(JSON.stringify({ data: [{ id: 'foo' }] }), { status: 200 })
    );
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.models).toEqual(['foo']);
  });

  it('returns unavailable when endpoint missing', async () => {
    const provider = new VllmProvider({ name: 'vllm', timeoutMs: 1000, retries: 0, enabled: true });
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.reason).toContain('missing endpoint');
  });
});
