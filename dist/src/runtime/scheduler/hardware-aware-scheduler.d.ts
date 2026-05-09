import { HardwareProfile } from '../../hardware/profile.js';
export declare enum SchedulerState {
    LOCAL_OK = "LOCAL_OK",
    LOCAL_CONSTRAINED = "LOCAL_CONSTRAINED",
    GPU_UNAVAILABLE = "GPU_UNAVAILABLE",
    LOW_MEMORY = "LOW_MEMORY",
    LOW_POWER = "LOW_POWER",
    REMOTE_REQUIRED = "REMOTE_REQUIRED",
    DEGRADED_LOCAL_ONLY = "DEGRADED_LOCAL_ONLY"
}
export interface TaskRequirement {
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
    latencyBudgetMs: number;
    memoryBudgetMB: number;
    preferredModelSize: 'SMALL' | 'MEDIUM' | 'LARGE';
}
export interface SchedulingDecision {
    state: SchedulerState;
    target: 'LOCAL' | 'REMOTE' | 'NONE';
    modelSize: 'SMALL' | 'MEDIUM' | 'LARGE' | 'NONE';
    reason: string;
}
export declare class HardwareAwareScheduler {
    private profile;
    constructor(profile: HardwareProfile);
    schedule(task: TaskRequirement, remoteAvailable: boolean): SchedulingDecision;
    private isModelSizeSupported;
}
