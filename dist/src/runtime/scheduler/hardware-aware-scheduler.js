import { HardwareProfileTier } from '../../hardware/profile.js';
export var SchedulerState;
(function (SchedulerState) {
    SchedulerState["LOCAL_OK"] = "LOCAL_OK";
    SchedulerState["LOCAL_CONSTRAINED"] = "LOCAL_CONSTRAINED";
    SchedulerState["GPU_UNAVAILABLE"] = "GPU_UNAVAILABLE";
    SchedulerState["LOW_MEMORY"] = "LOW_MEMORY";
    SchedulerState["LOW_POWER"] = "LOW_POWER";
    SchedulerState["REMOTE_REQUIRED"] = "REMOTE_REQUIRED";
    SchedulerState["DEGRADED_LOCAL_ONLY"] = "DEGRADED_LOCAL_ONLY";
})(SchedulerState || (SchedulerState = {}));
export class HardwareAwareScheduler {
    profile;
    constructor(profile) {
        this.profile = profile;
    }
    schedule(task, remoteAvailable) {
        const caps = this.profile.capabilities;
        // Check for critical conditions
        if (caps.batteryStatus === 'LOW_POWER') {
            return {
                state: SchedulerState.LOW_POWER,
                target: remoteAvailable ? 'REMOTE' : 'NONE',
                modelSize: remoteAvailable ? task.preferredModelSize : 'NONE',
                reason: 'Low power mode active, preferring remote or suspending local'
            };
        }
        if (caps.availableMemory < task.memoryBudgetMB * 1024 * 1024) {
            return {
                state: SchedulerState.LOW_MEMORY,
                target: remoteAvailable ? 'REMOTE' : 'NONE',
                modelSize: remoteAvailable ? task.preferredModelSize : 'NONE',
                reason: 'Insufficient memory for task budget'
            };
        }
        // Determine if local is viable
        const canRunLocal = this.profile.canRunLocal && this.isModelSizeSupported(task.preferredModelSize);
        if (!canRunLocal) {
            if (remoteAvailable) {
                return {
                    state: SchedulerState.REMOTE_REQUIRED,
                    target: 'REMOTE',
                    modelSize: task.preferredModelSize,
                    reason: 'Local hardware insufficient for requested model size'
                };
            }
            else {
                // Degraded state: try to run a smaller model locally if possible
                return {
                    state: SchedulerState.LOCAL_CONSTRAINED,
                    target: 'LOCAL',
                    modelSize: 'SMALL',
                    reason: 'Remote unavailable, falling back to smallest local model'
                };
            }
        }
        // If local is OK, check for GPU
        if (task.complexity === 'HIGH' && !caps.gpuAvailable) {
            if (remoteAvailable) {
                return {
                    state: SchedulerState.REMOTE_REQUIRED,
                    target: 'REMOTE',
                    modelSize: task.preferredModelSize,
                    reason: 'High complexity task requires GPU (unavailable locally)'
                };
            }
            return {
                state: SchedulerState.GPU_UNAVAILABLE,
                target: 'LOCAL',
                modelSize: 'SMALL',
                reason: 'GPU unavailable for high complexity task, running degraded locally'
            };
        }
        return {
            state: SchedulerState.LOCAL_OK,
            target: 'LOCAL',
            modelSize: task.preferredModelSize,
            reason: 'Local hardware meets all requirements'
        };
    }
    isModelSizeSupported(size) {
        const tier = this.profile.tier;
        if (tier === HardwareProfileTier.ULTRA)
            return true;
        if (tier === HardwareProfileTier.STANDARD)
            return size !== 'LARGE';
        if (tier === HardwareProfileTier.CONSTRAINED)
            return size === 'SMALL';
        return false;
    }
}
