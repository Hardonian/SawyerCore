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

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url().optional(),
  timeoutMs: z.number().int().positive(),
  retries: z.number().int().min(0).max(5),
  enabled: z.boolean()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const GovernancePolicySchema = z.object({
  requireAudit: z.boolean(),
  cloudEgressAllowedFor: z.array(z.enum(['public', 'internal'])),
  denyModelList: z.array(z.string()),
  allowModelList: z.array(z.string()),
  maxCostPerRequestUsd: z.number().nonnegative(),
  maxTokens: z.number().int().positive(),
  maxRequestBytes: z.number().int().positive().default(1024 * 1024),
  fallbackAllowed: z.boolean(),
  dataRetention: z.enum(['none', 'transient', 'standard']),
  tenantPermissions: z.record(
    z.object({
      cloudAllowed: z.boolean(),
      privateDataCloudAllowed: z.boolean()
    })
  )
});

export type GovernancePolicy = z.infer<typeof GovernancePolicySchema>;

export const SawyerConfigSchema = z.object({
  version: z.string().min(1),
  profile: z.string().min(1),
  toggles: ToggleSchema,
  providers: z.object({
    vllm: ProviderConfigSchema,
    litellm: ProviderConfigSchema,
    cloud: ProviderConfigSchema,
    onnx: ProviderConfigSchema,
    mobileNpu: ProviderConfigSchema
  }),
  policy: GovernancePolicySchema
});

export type SawyerConfig = z.infer<typeof SawyerConfigSchema>;
