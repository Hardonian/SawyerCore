import { z } from 'zod';
export declare const ToggleSchema: z.ZodObject<{
    enable_mobile_npu: z.ZodDefault<z.ZodBoolean>;
    enable_vllm: z.ZodDefault<z.ZodBoolean>;
    enable_litellm: z.ZodDefault<z.ZodBoolean>;
    enable_cloud_fallback: z.ZodDefault<z.ZodBoolean>;
    enable_ai_recommendations: z.ZodDefault<z.ZodBoolean>;
    enable_model_preloading: z.ZodDefault<z.ZodBoolean>;
    enable_cost_optimizer: z.ZodDefault<z.ZodBoolean>;
    enable_private_mode: z.ZodDefault<z.ZodBoolean>;
    enable_verbose_audit: z.ZodDefault<z.ZodBoolean>;
    enable_battery_aware_routing: z.ZodDefault<z.ZodBoolean>;
    enable_thermal_aware_routing: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enable_mobile_npu: boolean;
    enable_vllm: boolean;
    enable_litellm: boolean;
    enable_cloud_fallback: boolean;
    enable_ai_recommendations: boolean;
    enable_model_preloading: boolean;
    enable_cost_optimizer: boolean;
    enable_private_mode: boolean;
    enable_verbose_audit: boolean;
    enable_battery_aware_routing: boolean;
    enable_thermal_aware_routing: boolean;
}, {
    enable_mobile_npu?: boolean | undefined;
    enable_vllm?: boolean | undefined;
    enable_litellm?: boolean | undefined;
    enable_cloud_fallback?: boolean | undefined;
    enable_ai_recommendations?: boolean | undefined;
    enable_model_preloading?: boolean | undefined;
    enable_cost_optimizer?: boolean | undefined;
    enable_private_mode?: boolean | undefined;
    enable_verbose_audit?: boolean | undefined;
    enable_battery_aware_routing?: boolean | undefined;
    enable_thermal_aware_routing?: boolean | undefined;
}>;
export type RuntimeToggles = z.infer<typeof ToggleSchema>;
export declare const ProviderConfigSchema: z.ZodObject<{
    name: z.ZodString;
    endpoint: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodNumber;
    retries: z.ZodNumber;
    enabled: z.ZodBoolean;
    model: z.ZodString;
    modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    apiKeyEnv: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    model: string;
    enabled: boolean;
    timeoutMs: number;
    retries: number;
    endpoint?: string | undefined;
    modelAliases?: Record<string, string> | undefined;
    apiKeyEnv?: string | undefined;
}, {
    name: string;
    model: string;
    enabled: boolean;
    timeoutMs: number;
    retries: number;
    endpoint?: string | undefined;
    modelAliases?: Record<string, string> | undefined;
    apiKeyEnv?: string | undefined;
}>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export declare const GovernancePolicySchema: z.ZodObject<{
    requireAudit: z.ZodBoolean;
    cloudEgressAllowedFor: z.ZodArray<z.ZodEnum<["public", "internal"]>, "many">;
    denyModelList: z.ZodArray<z.ZodString, "many">;
    allowModelList: z.ZodArray<z.ZodString, "many">;
    maxCostPerRequestUsd: z.ZodNumber;
    maxTokens: z.ZodNumber;
    maxRequestBytes: z.ZodNumber;
    fallbackAllowed: z.ZodBoolean;
    dataRetention: z.ZodEnum<["none", "transient", "standard"]>;
    tenantPermissions: z.ZodRecord<z.ZodString, z.ZodObject<{
        cloudAllowed: z.ZodBoolean;
        privateDataCloudAllowed: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        cloudAllowed: boolean;
        privateDataCloudAllowed: boolean;
    }, {
        cloudAllowed: boolean;
        privateDataCloudAllowed: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    requireAudit: boolean;
    cloudEgressAllowedFor: ("public" | "internal")[];
    denyModelList: string[];
    allowModelList: string[];
    maxCostPerRequestUsd: number;
    maxTokens: number;
    maxRequestBytes: number;
    fallbackAllowed: boolean;
    dataRetention: "none" | "transient" | "standard";
    tenantPermissions: Record<string, {
        cloudAllowed: boolean;
        privateDataCloudAllowed: boolean;
    }>;
}, {
    requireAudit: boolean;
    cloudEgressAllowedFor: ("public" | "internal")[];
    denyModelList: string[];
    allowModelList: string[];
    maxCostPerRequestUsd: number;
    maxTokens: number;
    maxRequestBytes: number;
    fallbackAllowed: boolean;
    dataRetention: "none" | "transient" | "standard";
    tenantPermissions: Record<string, {
        cloudAllowed: boolean;
        privateDataCloudAllowed: boolean;
    }>;
}>;
export type GovernancePolicy = z.infer<typeof GovernancePolicySchema>;
export declare const SawyerConfigSchema: z.ZodObject<{
    version: z.ZodString;
    profile: z.ZodString;
    toggles: z.ZodObject<{
        enable_mobile_npu: z.ZodDefault<z.ZodBoolean>;
        enable_vllm: z.ZodDefault<z.ZodBoolean>;
        enable_litellm: z.ZodDefault<z.ZodBoolean>;
        enable_cloud_fallback: z.ZodDefault<z.ZodBoolean>;
        enable_ai_recommendations: z.ZodDefault<z.ZodBoolean>;
        enable_model_preloading: z.ZodDefault<z.ZodBoolean>;
        enable_cost_optimizer: z.ZodDefault<z.ZodBoolean>;
        enable_private_mode: z.ZodDefault<z.ZodBoolean>;
        enable_verbose_audit: z.ZodDefault<z.ZodBoolean>;
        enable_battery_aware_routing: z.ZodDefault<z.ZodBoolean>;
        enable_thermal_aware_routing: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enable_mobile_npu: boolean;
        enable_vllm: boolean;
        enable_litellm: boolean;
        enable_cloud_fallback: boolean;
        enable_ai_recommendations: boolean;
        enable_model_preloading: boolean;
        enable_cost_optimizer: boolean;
        enable_private_mode: boolean;
        enable_verbose_audit: boolean;
        enable_battery_aware_routing: boolean;
        enable_thermal_aware_routing: boolean;
    }, {
        enable_mobile_npu?: boolean | undefined;
        enable_vllm?: boolean | undefined;
        enable_litellm?: boolean | undefined;
        enable_cloud_fallback?: boolean | undefined;
        enable_ai_recommendations?: boolean | undefined;
        enable_model_preloading?: boolean | undefined;
        enable_cost_optimizer?: boolean | undefined;
        enable_private_mode?: boolean | undefined;
        enable_verbose_audit?: boolean | undefined;
        enable_battery_aware_routing?: boolean | undefined;
        enable_thermal_aware_routing?: boolean | undefined;
    }>;
    providers: z.ZodObject<{
        vllm: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
        litellm: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
        cloud: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
        llamaCpp: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
        onnx: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
        mobileNpu: z.ZodObject<{
            name: z.ZodString;
            endpoint: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodNumber;
            retries: z.ZodNumber;
            enabled: z.ZodBoolean;
            model: z.ZodString;
            modelAliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        vllm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        litellm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        cloud: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        llamaCpp: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        onnx: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        mobileNpu: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
    }, {
        vllm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        litellm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        cloud: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        llamaCpp: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        onnx: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        mobileNpu: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
    }>;
    policy: z.ZodObject<{
        requireAudit: z.ZodBoolean;
        cloudEgressAllowedFor: z.ZodArray<z.ZodEnum<["public", "internal"]>, "many">;
        denyModelList: z.ZodArray<z.ZodString, "many">;
        allowModelList: z.ZodArray<z.ZodString, "many">;
        maxCostPerRequestUsd: z.ZodNumber;
        maxTokens: z.ZodNumber;
        maxRequestBytes: z.ZodNumber;
        fallbackAllowed: z.ZodBoolean;
        dataRetention: z.ZodEnum<["none", "transient", "standard"]>;
        tenantPermissions: z.ZodRecord<z.ZodString, z.ZodObject<{
            cloudAllowed: z.ZodBoolean;
            privateDataCloudAllowed: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }>>;
    }, "strip", z.ZodTypeAny, {
        requireAudit: boolean;
        cloudEgressAllowedFor: ("public" | "internal")[];
        denyModelList: string[];
        allowModelList: string[];
        maxCostPerRequestUsd: number;
        maxTokens: number;
        maxRequestBytes: number;
        fallbackAllowed: boolean;
        dataRetention: "none" | "transient" | "standard";
        tenantPermissions: Record<string, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }>;
    }, {
        requireAudit: boolean;
        cloudEgressAllowedFor: ("public" | "internal")[];
        denyModelList: string[];
        allowModelList: string[];
        maxCostPerRequestUsd: number;
        maxTokens: number;
        maxRequestBytes: number;
        fallbackAllowed: boolean;
        dataRetention: "none" | "transient" | "standard";
        tenantPermissions: Record<string, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }>;
    }>;
}, "strip", z.ZodTypeAny, {
    version: string;
    profile: string;
    toggles: {
        enable_mobile_npu: boolean;
        enable_vllm: boolean;
        enable_litellm: boolean;
        enable_cloud_fallback: boolean;
        enable_ai_recommendations: boolean;
        enable_model_preloading: boolean;
        enable_cost_optimizer: boolean;
        enable_private_mode: boolean;
        enable_verbose_audit: boolean;
        enable_battery_aware_routing: boolean;
        enable_thermal_aware_routing: boolean;
    };
    providers: {
        vllm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        litellm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        cloud: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        llamaCpp: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        onnx: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        mobileNpu: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
    };
    policy: {
        requireAudit: boolean;
        cloudEgressAllowedFor: ("public" | "internal")[];
        denyModelList: string[];
        allowModelList: string[];
        maxCostPerRequestUsd: number;
        maxTokens: number;
        maxRequestBytes: number;
        fallbackAllowed: boolean;
        dataRetention: "none" | "transient" | "standard";
        tenantPermissions: Record<string, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }>;
    };
}, {
    version: string;
    profile: string;
    toggles: {
        enable_mobile_npu?: boolean | undefined;
        enable_vllm?: boolean | undefined;
        enable_litellm?: boolean | undefined;
        enable_cloud_fallback?: boolean | undefined;
        enable_ai_recommendations?: boolean | undefined;
        enable_model_preloading?: boolean | undefined;
        enable_cost_optimizer?: boolean | undefined;
        enable_private_mode?: boolean | undefined;
        enable_verbose_audit?: boolean | undefined;
        enable_battery_aware_routing?: boolean | undefined;
        enable_thermal_aware_routing?: boolean | undefined;
    };
    providers: {
        vllm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        litellm: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        cloud: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        llamaCpp: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        onnx: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
        mobileNpu: {
            name: string;
            model: string;
            enabled: boolean;
            timeoutMs: number;
            retries: number;
            endpoint?: string | undefined;
            modelAliases?: Record<string, string> | undefined;
            apiKeyEnv?: string | undefined;
        };
    };
    policy: {
        requireAudit: boolean;
        cloudEgressAllowedFor: ("public" | "internal")[];
        denyModelList: string[];
        allowModelList: string[];
        maxCostPerRequestUsd: number;
        maxTokens: number;
        maxRequestBytes: number;
        fallbackAllowed: boolean;
        dataRetention: "none" | "transient" | "standard";
        tenantPermissions: Record<string, {
            cloudAllowed: boolean;
            privateDataCloudAllowed: boolean;
        }>;
    };
}>;
export type SawyerConfig = z.infer<typeof SawyerConfigSchema>;
