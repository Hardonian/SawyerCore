import { ToggleSchema, type SawyerConfig } from '../types/config.js';

export function safeDefaultConfig(): SawyerConfig {
  return {
    version: '1.0.0',
    profile: 'local-safe',
    toggles: ToggleSchema.parse({
      enable_mobile_npu: false,
      enable_vllm: true,
      enable_litellm: false,
      enable_cloud_fallback: false,
      enable_ai_recommendations: false,
      enable_model_preloading: true,
      enable_cost_optimizer: true,
      enable_private_mode: true,
      enable_verbose_audit: true,
      enable_battery_aware_routing: true,
      enable_thermal_aware_routing: true
    }),
    providers: {
      vllm: { name: 'vllm', endpoint: 'http://localhost:8000/v1', timeoutMs: 3500, retries: 1, enabled: true },
      litellm: { name: 'litellm', endpoint: 'http://localhost:4000', timeoutMs: 3500, retries: 1, enabled: false },
      cloud: { name: 'cloud', timeoutMs: 8000, retries: 1, enabled: false },
      onnx: { name: 'onnx', timeoutMs: 1500, retries: 1, enabled: true },
      mobileNpu: { name: 'mobileNpu', timeoutMs: 1200, retries: 1, enabled: false }
    },
    policy: {
      requireAudit: true,
      cloudEgressAllowedFor: ['public'],
      denyModelList: [],
      allowModelList: [],
      maxCostPerRequestUsd: 0.02,
      maxTokens: 8192,
      fallbackAllowed: false,
      dataRetention: 'none',
      tenantPermissions: {
        default: { cloudAllowed: false, privateDataCloudAllowed: false }
      }
    }
  };
}
