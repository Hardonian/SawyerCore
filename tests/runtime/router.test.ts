import { describe, it, expect } from 'vitest';
import { SawyerRouter } from '../../src/runtime/router.js';
import { AuditLogger } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { MockProvider } from '../../src/providers/providers.js';
import type { AiTask } from '../../src/types/contracts.js';

const task: AiTask = {
  id: 'route-1',
  type: 'classification',
  input: 'classify this',
  inputClassification: 'public',
  requiredCapability: 'classification',
  latencyPreferenceMs: 200,
  privacyRequirement: 'local-preferred',
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
  it('routes deterministically and creates audit event', async () => {
    const audit = new AuditLogger();
    const config = safeDefaultConfig();
    const router = new SawyerRouter([new MockProvider('a'), new MockProvider('b')], config, audit);
    const out = await router.route(task, 'default', {
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
    const out = await router.route(task, 'default', {
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
