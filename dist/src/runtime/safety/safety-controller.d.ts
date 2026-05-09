/**
 * Safety controller — fail-safe execution wrapper.
 * Never hard-fails user-facing routes.
 * Explicit degraded states: MODEL_UNAVAILABLE, LOW_MEMORY, PARTIAL_EXECUTION.
 */
import type { AiTask, InferenceResult } from '../../types/contracts.js';
import type { RoutingSignals } from '../optimization-engine.js';
import type { DegradedStateCode } from '../core/execution-log.js';
import { type ResourceLimits } from './resource-monitor.js';
import { ModelScaler, type ModelTier } from './model-scaler.js';
export interface SafetyConfig {
    resourceLimits?: Partial<ResourceLimits>;
    modelTiers?: ModelTier[];
    maxRetries: number;
}
export interface SafeExecutionResult {
    success: boolean;
    degradedState: DegradedStateCode;
    result: InferenceResult | null;
    reasons: string[];
    resourceSnapshot: {
        memoryPressure: string;
        cpuConstrained: boolean;
        shouldThrottle: boolean;
    };
    modelTier: string | null;
}
export interface ExecutionDelegate {
    execute(task: AiTask, tenantId: string, signals: RoutingSignals): Promise<{
        decision: string;
        result?: InferenceResult;
        reasons: string[];
        degraded?: boolean;
    }>;
}
export declare class SafetyController {
    private readonly monitor;
    private readonly scaler;
    private readonly config;
    constructor(config?: Partial<SafetyConfig>);
    safeExecute(delegate: ExecutionDelegate, task: AiTask, tenantId: string, signals: RoutingSignals): Promise<SafeExecutionResult>;
    getResourceAssessment(): import("./resource-monitor.js").ResourceAssessment;
    getModelScaler(): ModelScaler | null;
}
