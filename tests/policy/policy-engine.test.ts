import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/policy/policy-engine.js';
import { CloudFallbackProvider, MockProvider } from '../../src/providers/providers.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import type { AiTask } from '../../src/types/contracts.js';

const baseTask: AiTask = {
  id: 't1',
  type: 'chat',
  input: 'hello',
  inputClassification: 'private',
  requiredCapability: 'chat',
  latencyPreferenceMs: 500,
  privacyRequirement: 'local-only',
  maxBudgetUsd: 0.1,
  fallbackAllowed: false,
  maxContextTokens: 1024
};

describe('PolicyEngine', () => {
  it('fails closed when policy missing', () => {
    const engine = new PolicyEngine(undefined);
    const decision = engine.evaluate(baseTask, new MockProvider(), { tenantId: 'default', model: 'x', requestedTokens: 100 });
    expect(decision.allowed).toBe(false);
  });

  it('private prompt denies cloud', () => {
    const config = safeDefaultConfig();
    config.policy.fallbackAllowed = true;
    config.policy.tenantPermissions.default.cloudAllowed = true;
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate(baseTask, new CloudFallbackProvider('x-key'), { tenantId: 'default', model: 'cloud-default-model', requestedTokens: 100 });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('private/sensitive');
  });

  it('cost exceeded is denied', () => {
    const config = safeDefaultConfig();
    config.policy.maxCostPerRequestUsd = 0.000001;
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate({ ...baseTask, inputClassification: 'public', privacyRequirement: 'cloud-allowed', fallbackAllowed: true }, new CloudFallbackProvider('x-key'), {
      tenantId: 'default',
      model: 'mock-default-model',
      requestedTokens: 100
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('cost cap exceeded');
  });

  it('provider unhealthy excluded', () => {
    const config = safeDefaultConfig();
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate({ ...baseTask, inputClassification: 'public' }, new MockProvider(), {
      tenantId: 'default',
      model: 'mock-default-model',
      requestedTokens: 100,
      providerHealthy: false
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('provider unhealthy');
  });

  it('token cap exceeded denied', () => {
    const config = safeDefaultConfig();
    config.policy.maxTokens = 64;
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate(baseTask, new MockProvider(), {
      tenantId: 'default',
      model: 'mock-default-model',
      requestedTokens: 100
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('token/context limit exceeded');
  });
});
