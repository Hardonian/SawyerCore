export interface PreloadInput {
    profile: string;
    availableMemoryGb: number;
    batteryPercent: number;
    recentUsage: Record<string, number>;
    taskPriorities: string[];
}
export interface PreloadPlan {
    startup: string[];
    lazyLoad: string[];
    unloadUnderPressure: string[];
    mobileSync: string[];
    keepWarmProviders: string[];
}
export declare function buildPreloadPlan(input: PreloadInput): PreloadPlan;
