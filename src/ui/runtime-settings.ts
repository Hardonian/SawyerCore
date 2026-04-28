export interface SettingCard {
  key: string;
  currentValue: string;
  recommendedValue: string;
  whyItMatters: string;
  riskIfChanged: string;
}

export interface RuntimeSettingsPage {
  runtimeSettings: SettingCard[];
  deviceProfile: SettingCard[];
  providerHealth: SettingCard[];
  recommendationSummary: SettingCard[];
  togglePanel: SettingCard[];
  policyWarnings: SettingCard[];
}

export function buildRuntimeSettingsPage(): RuntimeSettingsPage {
  const card = (key: string, currentValue: string, recommendedValue: string, whyItMatters: string, riskIfChanged: string): SettingCard => ({
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
