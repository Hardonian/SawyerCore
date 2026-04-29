const WEIGHTS = {
    latency: 0.2,
    cost: 0.15,
    privacy: 0.2,
    availability: 0.2,
    hardwareMatch: 0.1,
    taskSuitability: 0.1,
    failureHistory: 0.05
};
export class SawyerOptimizationEngine {
    score(task, provider, signals) {
        const latencyNorm = Math.max(0, 1 - provider.estimateLatency(task) / 2000);
        const costNorm = Math.max(0, 1 - provider.estimateCost(task) / Math.max(task.maxBudgetUsd, 0.000001));
        const privacyNorm = provider.getCapabilities().supportsPrivateData ? 1 : 0;
        const availabilityNorm = signals.hardwareAvailable[provider.target] ? 1 : 0;
        const batteryPenalty = signals.batteryPercent < 25 && provider.target === 'LOCAL_GPU' ? -0.4 : 0;
        const thermalPenalty = signals.thermalState === 'hot' && provider.target === 'LOCAL_NPU' ? -0.25 : 0;
        const hardwareMatchNorm = Math.max(0, availabilityNorm + batteryPenalty + thermalPenalty);
        const supportsTask = provider.supportsTask(task);
        const taskSuitabilityNorm = supportsTask ? 1 : 0;
        const failures = signals.failureHistory[provider.name] ?? 0;
        const failureNorm = Math.max(0, 1 - failures / 10);
        const learnedPreference = signals.preferredProviderName === provider.name ? 100 : 0;
        const breakdown = {
            latency: Number((latencyNorm * WEIGHTS.latency * 100).toFixed(4)),
            cost: Number((costNorm * WEIGHTS.cost * 100).toFixed(4)),
            privacy: Number((privacyNorm * WEIGHTS.privacy * 100).toFixed(4)),
            availability: Number((availabilityNorm * WEIGHTS.availability * 100).toFixed(4)),
            hardwareMatch: Number((hardwareMatchNorm * WEIGHTS.hardwareMatch * 100).toFixed(4)),
            taskSuitability: Number((taskSuitabilityNorm * WEIGHTS.taskSuitability * 100).toFixed(4)),
            failureHistory: Number((failureNorm * WEIGHTS.failureHistory * 100).toFixed(4)),
            learnedPreference
        };
        return {
            providerName: provider.name,
            total: Number(Object.values(breakdown).reduce((sum, x) => sum + x, 0).toFixed(4)),
            breakdown
        };
    }
}
