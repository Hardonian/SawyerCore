import { z } from 'zod';

export const ToggleSchema = z.object({
  enable_mobile_npu: z.boolean().default(false),
  enable_vllm: z.boolean().default(true),
  enable_litellm: z.boolean().default(true),
  enable_cloud_fallback: z.boolean().default(false),
  enable_ai_recommendations: z.boolean().default(false),
  enable_model_preloading: z.boolean().default(true),
  enable_cost_optimizer: z.boolean().default(true),
  enable_private_mode: z.boolean().default(true),
  enable_verbose_audit: z.boolean().default(true),
  enable_battery_aware_routing: z.boolean().default(true),
  enable_thermal_aware_routing: z.boolean().default(true)
});

export type RuntimeToggles = z.infer<typeof ToggleSchema>;

export interface ProviderConfig {
  name: string;
  endpoint?: string;
  timeoutMs: number;
  retries: number;
  enabled: boolean;
  model: string;
  modelAliases?: Record<string, string>;
  apiKeyEnv?: string;
}

export interface GovernancePolicy {
  requireAudit: boolean;
  cloudEgressAllowedFor: ('public' | 'internal')[];
  denyModelList: string[];
  allowModelList: string[];
  maxCostPerRequestUsd: number;
  maxTokens: number;
  maxRequestBytes: number;
  fallbackAllowed: boolean;
  dataRetention: 'none' | 'transient' | 'standard';
  tenantPermissions: Record<string, { cloudAllowed: boolean; privateDataCloudAllowed: boolean }>;
}

export interface SawyerConfig {
  version: string;
  profile: string;
  toggles: RuntimeToggles;
  providers: {
    vllm: ProviderConfig;
    litellm: ProviderConfig;
    cloud: ProviderConfig;
    llamaCpp: ProviderConfig;
    onnx: ProviderConfig;
    mobileNpu: ProviderConfig;
  };
  policy: GovernancePolicy;
}
