/**
 * Safety controller — fail-safe execution wrapper.
 * Never hard-fails user-facing routes.
 * Explicit degraded states: MODEL_UNAVAILABLE, LOW_MEMORY, PARTIAL_EXECUTION.
 */

import type { AiTask, InferenceResult } from '../../types/contracts.js';
import type { RoutingSignals } from '../optimization-engine.js';
import type { DegradedStateCode } from '../core/execution-log.js';
import { ResourceMonitor, type ResourceLimits } from './resource-monitor.js';
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
  execute(
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals
  ): Promise<{ decision: string; result?: InferenceResult; reasons: string[]; degraded?: boolean }>;
}

const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  maxRetries: 1
};

export class SafetyController {
  private readonly monitor: ResourceMonitor;
  private readonly scaler: ModelScaler | null;
  private readonly config: SafetyConfig;

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
    this.monitor = new ResourceMonitor(this.config.resourceLimits);
    this.scaler = this.config.modelTiers ? new ModelScaler(this.config.modelTiers) : null;
  }

  async safeExecute(
    delegate: ExecutionDelegate,
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals
  ): Promise<SafeExecutionResult> {
    const assessment = this.monitor.assess();

    if (assessment.memoryPressure === 'HARD_LIMIT') {
      return {
        success: false,
        degradedState: 'LOW_MEMORY',
        result: null,
        reasons: ['hard memory limit exceeded; execution blocked', ...assessment.reasons],
        resourceSnapshot: {
          memoryPressure: assessment.memoryPressure,
          cpuConstrained: assessment.cpuConstrained,
          shouldThrottle: assessment.shouldThrottle
        },
        modelTier: null
      };
    }

    const modelTier = this.scaler
      ? this.scaler.selectTier(
          assessment.snapshot.memoryFreeBytes / (1024 * 1024 * 1024),
          task.type
        )
      : null;

    let lastError: string | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await delegate.execute(task, tenantId, signals);

        if (result.degraded) {
          return {
            success: false,
            degradedState: 'MODEL_UNAVAILABLE',
            result: result.result ?? null,
            reasons: result.reasons,
            resourceSnapshot: {
              memoryPressure: assessment.memoryPressure,
              cpuConstrained: assessment.cpuConstrained,
              shouldThrottle: assessment.shouldThrottle
            },
            modelTier: modelTier?.id ?? null
          };
        }

        return {
          success: true,
          degradedState: assessment.memoryPressure === 'SOFT_LIMIT' ? 'PARTIAL_EXECUTION' : 'NOMINAL',
          result: result.result ?? null,
          reasons: assessment.memoryPressure === 'SOFT_LIMIT' ? ['operating under memory soft limit'] : [],
          resourceSnapshot: {
            memoryPressure: assessment.memoryPressure,
            cpuConstrained: assessment.cpuConstrained,
            shouldThrottle: assessment.shouldThrottle
          },
          modelTier: modelTier?.id ?? null
        };
      } catch (error) {
        lastError = (error as Error).message;
      }
    }

    return {
      success: false,
      degradedState: 'PARTIAL_EXECUTION',
      result: null,
      reasons: [`execution failed after ${this.config.maxRetries + 1} attempts: ${lastError}`],
      resourceSnapshot: {
        memoryPressure: assessment.memoryPressure,
        cpuConstrained: assessment.cpuConstrained,
        shouldThrottle: assessment.shouldThrottle
      },
      modelTier: modelTier?.id ?? null
    };
  }

  getResourceAssessment() {
    return this.monitor.assess();
  }

  getModelScaler(): ModelScaler | null {
    return this.scaler;
  }
}
