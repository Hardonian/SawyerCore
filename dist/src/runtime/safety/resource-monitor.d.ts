/**
 * Resource monitor — CPU and memory sampling with soft/hard limits.
 * Provides real-time resource awareness for throttling decisions.
 */
export interface ResourceLimits {
    maxCpuCores: number;
    memorySoftLimitBytes: number;
    memoryHardLimitBytes: number;
}
export interface ResourceSnapshot {
    cpuCount: number;
    cpuLoadAverage: number;
    memoryTotalBytes: number;
    memoryFreeBytes: number;
    memoryUsedBytes: number;
    memoryUsagePercent: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
}
export type ResourcePressure = 'NOMINAL' | 'SOFT_LIMIT' | 'HARD_LIMIT';
export interface ResourceAssessment {
    snapshot: ResourceSnapshot;
    memoryPressure: ResourcePressure;
    cpuConstrained: boolean;
    shouldThrottle: boolean;
    reasons: string[];
}
export declare class ResourceMonitor {
    private readonly limits;
    constructor(limits?: Partial<ResourceLimits>);
    sample(): ResourceSnapshot;
    assess(): ResourceAssessment;
    getLimits(): Readonly<ResourceLimits>;
    private getCpuLoadAverage;
}
