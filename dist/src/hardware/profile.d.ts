import { HardwareCapabilities } from './probe.js';
export declare enum HardwareProfileTier {
    ULTRA = "ULTRA",// High-end GPU, plenty of RAM
    STANDARD = "STANDARD",// Reasonable CPU/RAM, maybe no GPU
    CONSTRAINED = "CONSTRAINED",// Low RAM or CPU
    CRITICAL = "CRITICAL"
}
export interface HardwareProfile {
    tier: HardwareProfileTier;
    capabilities: HardwareCapabilities;
    recommendedModelSize: 'LARGE' | 'MEDIUM' | 'SMALL' | 'NONE';
    canRunLocal: boolean;
    canRunGPU: boolean;
}
export declare function getHardwareProfile(caps: HardwareCapabilities): HardwareProfile;
