import { describe, it, expect } from 'vitest';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';

describe('config defaults', () => {
  it('keeps cloud fallback disabled in local-safe', () => {
    const config = safeDefaultConfig();
    expect(config.profile).toBe('local-safe');
    expect(config.toggles.enable_cloud_fallback).toBe(false);
  });

  it('contains all toggles', () => {
    const toggles = safeDefaultConfig().toggles;
    expect(Object.keys(toggles)).toEqual(
      expect.arrayContaining([
        'enable_mobile_npu',
        'enable_vllm',
        'enable_litellm',
        'enable_cloud_fallback',
        'enable_ai_recommendations',
        'enable_model_preloading',
        'enable_cost_optimizer',
        'enable_private_mode',
        'enable_verbose_audit',
        'enable_battery_aware_routing',
        'enable_thermal_aware_routing'
      ])
    );
  });
});
