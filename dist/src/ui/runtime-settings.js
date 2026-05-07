export function buildRuntimeSettingsPage() {
    const card = (key, currentValue, recommendedValue, whyItMatters, riskIfChanged) => ({
        key,
        currentValue,
        recommendedValue,
        whyItMatters,
        riskIfChanged
    });
    return {
        runtimeSettings: [card('profile', 'balanced', 'local-safe', 'controls routing strategy', 'may leak sensitive data if too permissive')],
        deviceProfile: [card('npu', 'unknown', 'auto-detect', 'improves on-device throughput', 'unsupported execution path')],
        providerHealth: [card('vllm', 'healthy', 'healthy', 'affects latency', 'fallback traffic spikes')],
        recommendationSummary: [card('quantization', 'q6', 'q4', 'fits low RAM devices', 'OOM during startup')],
        togglePanel: [card('enable_cloud_fallback', 'false', 'false', 'keeps private data local', 'privacy egress risk')],
        policyWarnings: [card('private_mode', 'enabled', 'enabled', 'enforces fail-closed policy', 'silent cloud exposure if disabled')]
    };
}
