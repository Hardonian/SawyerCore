export type DeviceType = 'laptop' | 'desktop' | 'workstation' | 'server' | 'android-phone' | 'mini-pc' | 'nas';
export type OSType = 'Windows' | 'WSL' | 'Linux' | 'macOS' | 'Android';
export interface DeviceInventory {
    deviceType: DeviceType;
    os: OSType;
    cpuCores: number;
    ramGb: number;
    hasGpu: boolean;
    vramGb: number;
    hasNpu: boolean;
    batterySensitive: boolean;
    thermalSensitive: boolean;
    privacyPreference: 'strict' | 'balanced' | 'permissive';
    budgetPreference: 'low' | 'medium' | 'high';
    speedVsQuality: 'speed' | 'balanced' | 'quality';
    mode: 'local-first' | 'cloud-assisted';
}
export declare function recommendProfile(inventory: DeviceInventory): string;
