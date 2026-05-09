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
export declare function buildRuntimeSettingsPage(): RuntimeSettingsPage;
