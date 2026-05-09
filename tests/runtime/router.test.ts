import { describe, it, expect } from 'vitest';
import { SawyerRouter } from '../../src/runtime/router.js';
import { AuditLogger, InMemoryAuditSink } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { MockProvider, CloudFallbackProvider } from '../../src/providers/providers.js';
import type { RoutingSignals } from '../../src/runtime/optimization-engine.js';

const defaultSignals: RoutingSignals = {
  batteryPercent: 100,
  thermalState: 'nominal',
  hardwareAvailable: { LOCAL_GPU: true },
  failureHistory: {}
};
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

class FailingProvider extends MockProvider {
  override async runInference(): Promise<never> {
    throw new Error('boom');
  }
}

describe('SawyerRouter', () => {
  it('private prompt cannot route to cloud', async () => {
    const config = safeDefaultConfig();
    config.policy.fallbackAllowed = true;
    config.policy.tenantPermissions.default.cloudAllowed = true;
    config.policy.cloudEgressAllowedFor = ['public', 'internal'];

    const router = new SawyerRouter([new CloudFallbackProvider('test-key')], config, new AuditLogger(new InMemoryAuditSink()));
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
    const audit = new AuditLogger(new InMemoryAuditSink());
    const router = new SawyerRouter([new MockProvider('a'), new MockProvider('b')], config, audit);
    const out = await router.route(baseTask, 'default', {
      batteryPercent: 80,
      thermalState: 'nominal',
      hardwareAvailable: {
        LOCAL_NPU: true,
        LOCAL_CPU: true,
        LOCAL_GPU: true,
        VLLM_SERVER: true,
        LITELLM_PROXY: true,
        CLOUD_FALLBACK: false
      },
      failureHistory: {}
    });
    expect(out.decision).toBe('LOCAL_GPU');
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0]?.selectedProvider).toBe('a');
  });

  it('returns degraded deny when selected provider inference fails', async () => {
    const audit = new AuditLogger();
    const config = safeDefaultConfig();
    const router = new SawyerRouter([new FailingProvider('failing')], config, audit);
    const out = await router.route(baseTask, 'default', {
      batteryPercent: 80,
      thermalState: 'nominal',
      hardwareAvailable: { LOCAL_GPU: true },
      failureHistory: {}
    });
    expect(out.decision).toBe('DENY');
    expect(out.degraded).toBe(true);
    expect(out.reasons.join(' ')).toContain('inference failed');
  });
});
