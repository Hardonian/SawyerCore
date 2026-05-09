export var HardwareProfileTier;
(function (HardwareProfileTier) {
    HardwareProfileTier["ULTRA"] = "ULTRA";
    HardwareProfileTier["STANDARD"] = "STANDARD";
    HardwareProfileTier["CONSTRAINED"] = "CONSTRAINED";
    HardwareProfileTier["CRITICAL"] = "CRITICAL"; // Extremely low resources, battery low, or high pressure
})(HardwareProfileTier || (HardwareProfileTier = {}));
export function getHardwareProfile(caps) {
    let tier = HardwareProfileTier.STANDARD;
    let recommendedModelSize = 'MEDIUM';
    let canRunLocal = true;
    let canRunGPU = caps.gpuAvailable;
    const totalRAM_GB = caps.totalMemory / (1024 * 1024 * 1024);
    const availRAM_GB = caps.availableMemory / (1024 * 1024 * 1024);
    if (caps.gpuAvailable && (caps.vramTotal || 0) > 8 * 1024 * 1024 * 1024 && totalRAM_GB > 32) {
        tier = HardwareProfileTier.ULTRA;
        recommendedModelSize = 'LARGE';
    }
    else if (totalRAM_GB < 8 || availRAM_GB < 2 || caps.diskPressure === 'HIGH') {
        tier = HardwareProfileTier.CONSTRAINED;
        recommendedModelSize = 'SMALL';
    }
    else if (availRAM_GB < 0.5 || caps.batteryStatus === 'LOW_POWER' || caps.thermalThrottling) {
        tier = HardwareProfileTier.CRITICAL;
        recommendedModelSize = 'NONE';
        canRunLocal = false;
    }
    return {
        tier,
        capabilities: caps,
        recommendedModelSize,
        canRunLocal,
        canRunGPU,
    };
}
