import { describe, it, expect } from 'vitest';
import { VllmProvider } from '../../src/providers/providers.js';

function okFetch(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => body
    }) as Response) as typeof fetch;
}

describe('providers', () => {
  it('reports health and capability', async () => {
    const provider = new VllmProvider(
      {
        endpoint: 'http://localhost:8000/v1',
        timeoutMs: 500,
        retries: 0,
        model: 'test-model'
      },
      okFetch({ data: [{ id: 'test-model' }] })
    );
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(provider.getCapabilities().maxContextTokens).toBeGreaterThan(1000);
  });
});
