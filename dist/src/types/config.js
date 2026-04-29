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
export const ProviderConfigSchema = z.object({
    name: z.string(),
    endpoint: z.string().optional(),
    timeoutMs: z.number(),
    retries: z.number(),
    enabled: z.boolean(),
    model: z.string(),
    modelAliases: z.record(z.string()).optional(),
    apiKeyEnv: z.string().optional()
});
export const GovernancePolicySchema = z.object({
    requireAudit: z.boolean(),
    cloudEgressAllowedFor: z.array(z.enum(['public', 'internal'])),
    denyModelList: z.array(z.string()),
    allowModelList: z.array(z.string()),
    maxCostPerRequestUsd: z.number(),
    maxTokens: z.number(),
    maxRequestBytes: z.number(),
    fallbackAllowed: z.boolean(),
    dataRetention: z.enum(['none', 'transient', 'standard']),
    tenantPermissions: z.record(z.object({
        cloudAllowed: z.boolean(),
        privateDataCloudAllowed: z.boolean()
    }))
});
export const SawyerConfigSchema = z.object({
    version: z.string(),
    profile: z.string(),
    toggles: ToggleSchema,
    providers: z.object({
        vllm: ProviderConfigSchema,
        litellm: ProviderConfigSchema,
        cloud: ProviderConfigSchema,
        llamaCpp: ProviderConfigSchema,
        onnx: ProviderConfigSchema,
        mobileNpu: ProviderConfigSchema
    }),
    policy: GovernancePolicySchema
});
