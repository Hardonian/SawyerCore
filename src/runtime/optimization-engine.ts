import type { AiTask } from '../types/contracts.js';
import type { RuntimeProvider } from '../providers/provider.js';

export interface RoutingSignals {
  batteryPercent: number;
  thermalState: 'nominal' | 'warm' | 'hot';
  hardwareAvailable: Record<string, boolean>;
  failureHistory: Record<string, number>;
}

export class SawyerOptimizationEngine {
  score(task: AiTask, provider: RuntimeProvider, signals: RoutingSignals): number {
    const latencyScore = Math.max(0, 1000 - provider.estimateLatency(task));
    const costScore = Math.max(0, 1000 - provider.estimateCost(task) * 100000);
    const privacyScore = provider.getCapabilities().supportsPrivateData ? 200 : 50;
    const batteryPenalty = signals.batteryPercent < 25 && provider.target === 'LOCAL_GPU' ? -250 : 0;
    const thermalPenalty = signals.thermalState === 'hot' && provider.target === 'LOCAL_NPU' ? -150 : 0;
    const capabilityBonus = provider.supportsTask(task) ? 200 : -800;
    const contextBonus = task.maxContextTokens <= provider.getCapabilities().maxContextTokens ? 100 : -400;
    const hardwareBonus = signals.hardwareAvailable[provider.target] ? 120 : -500;
    const failurePenalty = (signals.failureHistory[provider.name] ?? 0) * -60;
    return latencyScore + costScore + privacyScore + batteryPenalty + thermalPenalty + capabilityBonus + contextBonus + hardwareBonus + failurePenalty;
  }
}
