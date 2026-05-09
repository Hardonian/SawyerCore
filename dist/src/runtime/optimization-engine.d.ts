import type { AiTask } from '../types/contracts.js';
import type { RuntimeProvider } from '../providers/provider.js';
export interface RoutingSignals {
    batteryPercent: number;
    thermalState: 'nominal' | 'warm' | 'hot';
    hardwareAvailable: Record<string, boolean>;
    failureHistory: Record<string, number>;
    preferredProviderName?: string;
    blockedProviderNames?: string[];
}
export interface ProviderScore {
    providerName: string;
    total: number;
    breakdown: {
        latency: number;
        cost: number;
        privacy: number;
        availability: number;
        hardwareMatch: number;
        taskSuitability: number;
        failureHistory: number;
        learnedPreference: number;
    };
}
export declare class SawyerOptimizationEngine {
    score(task: AiTask, provider: RuntimeProvider, signals: RoutingSignals): ProviderScore;
}
