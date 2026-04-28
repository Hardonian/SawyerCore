import { describe, it, expect } from 'vitest';
import { SawyerRouter } from '../../src/runtime/router.js';
import { AuditLogger } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { VllmProvider, LiteLLMProvider, CloudFallbackProvider, OnnxRuntimeProvider, MobileNpuProvider } from '../../src/providers/providers.js';
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

describe('SawyerRouter', () => {
  it('routes deterministically and creates audit event', async () => {
    const audit = new AuditLogger();
    const config = safeDefaultConfig();
    config.policy.fallbackAllowed = true;
    config.policy.tenantPermissions.default.cloudAllowed = true;
    config.policy.cloudEgressAllowedFor = ['public', 'internal'];
    const router = new SawyerRouter([new MobileNpuProvider(), new OnnxRuntimeProvider(), new VllmProvider(), new LiteLLMProvider(), new CloudFallbackProvider()], config, audit);
    const out = await router.route(task, 'default', {
      batteryPercent: 80,
      thermalState: 'nominal',
      hardwareAvailable: {
        LOCAL_NPU: true,
        LOCAL_CPU: true,
        LOCAL_GPU: false,
        VLLM_SERVER: true,
        LITELLM_PROXY: true,
        CLOUD_FALLBACK: true
      },
      failureHistory: {}
    });
    expect(out.decision).toBe('LOCAL_NPU');
    expect(audit.list()).toHaveLength(1);
  });

  it('denies when providers unhealthy or policy blocked', async () => {
    const audit = new AuditLogger();
    const config = safeDefaultConfig();
    const vllm = new VllmProvider();
    vllm.setHealth(false);
    const router = new SawyerRouter([vllm], config, audit);
    const out = await router.route(task, 'default', {
      batteryPercent: 80,
      thermalState: 'nominal',
      hardwareAvailable: { VLLM_SERVER: true },
      failureHistory: {}
    });
    expect(out.decision).toBe('DENY');
  });
});
