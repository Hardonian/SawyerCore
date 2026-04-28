import { describe, it, expect } from 'vitest';
import { VllmProvider } from '../../src/providers/providers.js';

describe('providers', () => {
  it('reports health and capability', async () => {
    const provider = new VllmProvider();
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(provider.getCapabilities().maxContextTokens).toBeGreaterThan(1000);
  });
});
