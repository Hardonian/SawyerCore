export interface HardwareCapabilities {
    cpuCores: number;
    totalMemory: number;
    availableMemory: number;
    gpuAvailable: boolean;
    vramTotal?: number;
    vramAvailable?: number;
    diskPressure: 'LOW' | 'MEDIUM' | 'HIGH';
    batteryStatus?: 'AC' | 'BATTERY' | 'LOW_POWER';
    thermalThrottling: boolean;
}
export declare function probeHardware(): Promise<HardwareCapabilities>;
