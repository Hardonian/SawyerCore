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

  it('denies private data to cloud', () => {
    const config = safeDefaultConfig();
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate(baseTask, new CloudFallbackProvider(), { tenantId: 'default', model: 'cloud-default-model', requestedTokens: 100 });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('private/sensitive');
  });

  it('enforces cost cap denial', () => {
    const config = safeDefaultConfig();
    config.policy.maxCostPerRequestUsd = 0.000001;
    const engine = new PolicyEngine(config.policy);
    const decision = engine.evaluate({ ...baseTask, inputClassification: 'public', privacyRequirement: 'cloud-allowed', fallbackAllowed: true }, new MockProvider(), {
      tenantId: 'default',
      model: 'mock-default-model',
      requestedTokens: 100
    });
    expect(decision.allowed).toBe(false);
  });
});
