import { ToggleSchema } from '../types/config.js';
export function safeDefaultConfig() {
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
            vllm: {
                name: 'vllm',
                endpoint: 'http://localhost:8000/v1',
                timeoutMs: 3500,
                retries: 1,
                enabled: true,
                model: 'meta-llama/Llama-3.1-8B-Instruct',
                modelAliases: {
                    chat: 'meta-llama/Llama-3.1-8B-Instruct',
                    summarization: 'meta-llama/Llama-3.1-8B-Instruct',
                    'code-reasoning': 'Qwen/Qwen2.5-Coder-7B-Instruct'
                }
            },
            litellm: {
                name: 'litellm',
                endpoint: 'http://localhost:4000/v1',
                timeoutMs: 3500,
                retries: 1,
                enabled: false,
                model: 'gpt-4o-mini',
                apiKeyEnv: 'LITELLM_API_KEY'
            },
            cloud: {
                name: 'cloud',
                timeoutMs: 8000,
                retries: 1,
                enabled: false,
                model: 'gpt-4o-mini',
                apiKeyEnv: 'CLOUD_API_KEY'
            },
            llamaCpp: {
                name: 'llama.cpp',
                endpoint: 'http://localhost:8081',
                timeoutMs: 3500,
                retries: 1,
                enabled: false,
                model: 'llama.cpp-local'
            },
            onnx: { name: 'onnx', timeoutMs: 1500, retries: 1, enabled: true, model: 'onnx-default' },
            mobileNpu: { name: 'mobileNpu', timeoutMs: 1200, retries: 1, enabled: false, model: 'mobile-npu-default' }
        },
        policy: {
            requireAudit: true,
            cloudEgressAllowedFor: ['public'],
            denyModelList: [],
            allowModelList: [],
            maxCostPerRequestUsd: 0.02,
            maxTokens: 8192,
            maxRequestBytes: 1024 * 1024,
            fallbackAllowed: false,
            dataRetention: 'none',
            tenantPermissions: {
                default: { cloudAllowed: false, privateDataCloudAllowed: false }
            }
        }
    };
}
