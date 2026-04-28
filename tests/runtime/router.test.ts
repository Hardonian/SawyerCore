import { describe, it, expect } from 'vitest';
import { SawyerRouter } from '../../src/runtime/router.js';
import { AuditLogger, InMemoryAuditSink } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { VllmProvider, LiteLLMProvider, CloudFallbackProvider, MockProvider } from '../../src/providers/providers.js';
import type { AiTask } from '../../src/types/contracts.js';

const baseTask: AiTask = {
  id: 'route-1',
  type: 'chat',
  input: 'classify this',
  inputClassification: 'public',
  requiredCapability: 'chat',
  latencyPreferenceMs: 200,
  privacyRequirement: 'cloud-allowed',
  maxBudgetUsd: 0.2,
  fallbackAllowed: true,
  maxContextTokens: 1000
};

const defaultSignals = {
  batteryPercent: 80,
  thermalState: 'nominal' as const,
  hardwareAvailable: {
    LOCAL_NPU: true,
    LOCAL_CPU: true,
    LOCAL_GPU: true,
    VLLM_SERVER: true,
    LITELLM_PROXY: true,
    CLOUD_FALLBACK: true
  },
  failureHistory: {}
};

describe('SawyerRouter', () => {
  it('private prompt cannot route to cloud', async () => {
    const config = safeDefaultConfig();
    config.policy.fallbackAllowed = true;
    config.policy.tenantPermissions.default.cloudAllowed = true;
    config.policy.cloudEgressAllowedFor = ['public', 'internal'];

    const router = new SawyerRouter([new CloudFallbackProvider()], config, new AuditLogger(new InMemoryAuditSink()));
    const out = await router.route(
      { ...baseTask, inputClassification: 'private', privacyRequirement: 'local-only', fallbackAllowed: false },
      'default',
      defaultSignals
    );

    expect(out.decision).toBe('DENY');
    expect(out.reasons.join(' ')).toContain('private/sensitive');
  });

  it('unavailable vLLM can fall back to LiteLLM only when allowed', async () => {
    const config = safeDefaultConfig();
    config.policy.fallbackAllowed = true;
    config.policy.tenantPermissions.default.cloudAllowed = true;
    config.policy.cloudEgressAllowedFor = ['public', 'internal'];

    const vllm = new VllmProvider(config.providers.vllm, async () => new Response(null, { status: 503 }));
    const litellm = new LiteLLMProvider(
      { ...config.providers.litellm, enabled: true },
      async (input) => {
        const url = String(input);
        if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'lite-1' }] }), { status: 200 });
        return new Response(JSON.stringify({ model: 'lite-1', choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
    );

    const router = new SawyerRouter([vllm, litellm], config, new AuditLogger(new InMemoryAuditSink()));
    const out = await router.route(baseTask, 'default', defaultSignals);
    expect(out.decision).toBe('LITELLM_PROXY');
  });

  it('unavailable vLLM + LiteLLM with cloud disabled returns degraded error', async () => {
    const config = safeDefaultConfig();
    const badFetch = async () => new Response(null, { status: 503 });
    const router = new SawyerRouter(
      [new VllmProvider(config.providers.vllm, badFetch), new LiteLLMProvider({ ...config.providers.litellm, enabled: true }, badFetch)],
      config,
      new AuditLogger(new InMemoryAuditSink())
    );
    const out = await router.route(baseTask, 'default', defaultSignals);
    expect(out.decision).toBe('DENY');
    expect(out.reasons.join(' ')).toContain('unavailable');
  });

  it('cost cap denies', async () => {
    const config = safeDefaultConfig();
    config.policy.maxCostPerRequestUsd = 0;
    const router = new SawyerRouter([new MockProvider()], config, new AuditLogger(new InMemoryAuditSink()));
    const out = await router.route(baseTask, 'default', defaultSignals);
    expect(out.decision).toBe('DENY');
    expect(out.reasons.join(' ')).toContain('cost cap exceeded');
  });

  it('token cap denies', async () => {
    const config = safeDefaultConfig();
    config.policy.maxTokens = 10;
    const router = new SawyerRouter([new MockProvider()], config, new AuditLogger(new InMemoryAuditSink()));
    const out = await router.route(baseTask, 'default', defaultSignals);
    expect(out.decision).toBe('DENY');
    expect(out.reasons.join(' ')).toContain('token/context');
  });

  it('mock provider returns deterministic response', async () => {
    const config = safeDefaultConfig();
    config.policy.allowModelList = [];
    const router = new SawyerRouter([new MockProvider('mockA')], config, new AuditLogger(new InMemoryAuditSink()));
    const out = await router.route(baseTask, 'default', defaultSignals);
    expect(out.result?.output).toContain('[deterministic-mockA]');
  });

  it('never hard-500s on provider runtime failure', async () => {
    const config = safeDefaultConfig();
    const crashy = new MockProvider('crashy');
    crashy.runInference = async () => {
      throw new Error('boom');
    };
    const router = new SawyerRouter([crashy], config, new AuditLogger(new InMemoryAuditSink()));
    await expect(router.route(baseTask, 'default', defaultSignals)).resolves.toMatchObject({ decision: 'DENY' });
  });
});
