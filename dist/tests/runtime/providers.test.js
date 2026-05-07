import { describe, it, expect } from 'vitest';
import { VllmProvider } from '../../src/providers/providers.js';
function okFetch(body) {
    return (async () => ({
        ok: true,
        status: 200,
        json: async () => body
    }));
}
describe('providers', () => {
    it('reports health and capability', async () => {
        const provider = new VllmProvider({
            endpoint: 'http://localhost:8000/v1',
            timeoutMs: 500,
            retries: 0,
            model: 'test-model'
        }, okFetch({ data: [{ id: 'test-model' }] }));
        const health = await provider.healthCheck();
        expect(health.healthy).toBe(true);
        expect(health.models).toEqual(['test-model']);
    });
    it('returns unavailable when endpoint missing', async () => {
        const provider = new VllmProvider({ name: 'vllm', timeoutMs: 1000, retries: 0 });
        const health = await provider.healthCheck();
        expect(health.healthy).toBe(false);
        expect(health.reason).toContain('missing endpoint');
    });
});
