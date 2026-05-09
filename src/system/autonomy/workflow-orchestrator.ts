/**
 * Workflow orchestrator — processes work items through the execution engine.
 * Wraps the DeterministicEngine with retry logic, signal construction,
 * and result recording into the task detector and health aggregator.
 *
 * This is the bridge between the autonomy queue and the execution layer.
 */

import type { ExecutionReceipt } from '../../runtime/core/deterministic-engine.js';
import type { RoutingSignals } from '../../runtime/optimization-engine.js';
import type { TaskDetector } from './task-detector.js';
import type { IntentResolver, IntentDefaults } from './intent-resolver.js';
import type { HealthAggregator } from '../health/health-aggregator.js';
import type { EventBus } from '../events/event-bus.js';
import type { WorkItem } from '../events/event-types.js';

export interface OrchestratorConfig {
  defaultTenantId: string;
  defaultSignals: RoutingSignals;
  intentDefaults?: Partial<IntentDefaults>;
}

const DEFAULT_SIGNALS: RoutingSignals = {
  batteryPercent: 100,
  thermalState: 'nominal',
  hardwareAvailable: {
    LOCAL_NPU: false,
    LOCAL_CPU: true,
    LOCAL_GPU: false,
    VLLM_SERVER: true,
    LITELLM_PROXY: false,
    CLOUD_FALLBACK: false
  },
  failureHistory: {}
};

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  defaultTenantId: 'default',
  defaultSignals: DEFAULT_SIGNALS
};

export interface WorkflowResult {
  workItemId: string;
  receipt: ExecutionReceipt | null;
  success: boolean;
  error: string | null;
}

export interface ExecutionEngine {
  execute(task: ReturnType<IntentResolver['resolve']>, tenantId: string, signals: RoutingSignals): Promise<ExecutionReceipt>;
}

export class WorkflowOrchestrator {
  private readonly engine: ExecutionEngine;
  private readonly taskDetector: TaskDetector;
  private readonly intentResolver: IntentResolver;
  private readonly healthAggregator: HealthAggregator;
  private readonly eventBus: EventBus;
  private readonly config: OrchestratorConfig;
  private readonly failureHistory: Record<string, number> = {};

  constructor(
    engine: ExecutionEngine,
    taskDetector: TaskDetector,
    intentResolver: IntentResolver,
    healthAggregator: HealthAggregator,
    eventBus: EventBus,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.engine = engine;
    this.taskDetector = taskDetector;
    this.intentResolver = intentResolver;
    this.healthAggregator = healthAggregator;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  async processNext(): Promise<WorkflowResult | null> {
    const workItem = this.taskDetector.dequeue();
    if (!workItem) return null;

    return this.processItem(workItem);
  }

  async processAll(): Promise<WorkflowResult[]> {
    const pending = this.taskDetector.dequeueAll();
    const results: WorkflowResult[] = [];

    for (const item of pending) {
      const result = await this.processItem(item);
      results.push(result);
    }

    return results;
  }

  private async processItem(workItem: WorkItem): Promise<WorkflowResult> {
    this.taskDetector.markRunning(workItem.id);

    const task = this.intentResolver.resolve(
      workItem.intent,
      this.config.intentDefaults
    );

    const signals: RoutingSignals = {
      ...this.config.defaultSignals,
      failureHistory: { ...this.failureHistory }
    };

    try {
      const receipt = await this.engine.execute(task, this.config.defaultTenantId, signals);

      if (receipt.decision === 'DENY' || receipt.degradedState !== 'NOMINAL') {
        const error = receipt.reasons.join('; ') || `degraded: ${receipt.degradedState}`;

        this.recordFailure(receipt.decision);
        this.healthAggregator.recordResult(false);

        this.taskDetector.markFailed(workItem.id, error);

        return {
          workItemId: workItem.id,
          receipt,
          success: false,
          error
        };
      }

      this.healthAggregator.recordResult(true);

      this.taskDetector.markCompleted(workItem.id, {
        runId: receipt.runId,
        decision: receipt.decision,
        degradedState: receipt.degradedState,
        latencyMs: receipt.latencyMs
      });

      return {
        workItemId: workItem.id,
        receipt,
        success: true,
        error: null
      };
    } catch (error) {
      const message = (error as Error).message;
      this.healthAggregator.recordResult(false);
      this.taskDetector.markFailed(workItem.id, message);

      return {
        workItemId: workItem.id,
        receipt: null,
        success: false,
        error: message
      };
    }
  }

  private recordFailure(provider: string): void {
    this.failureHistory[provider] = (this.failureHistory[provider] ?? 0) + 1;
  }

  getFailureHistory(): Readonly<Record<string, number>> {
    return { ...this.failureHistory };
  }
}
