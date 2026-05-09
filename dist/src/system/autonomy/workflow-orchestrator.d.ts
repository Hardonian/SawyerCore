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
export interface OrchestratorConfig {
    defaultTenantId: string;
    defaultSignals: RoutingSignals;
    intentDefaults?: Partial<IntentDefaults>;
}
export interface WorkflowResult {
    workItemId: string;
    receipt: ExecutionReceipt | null;
    success: boolean;
    error: string | null;
}
export interface ExecutionEngine {
    execute(task: ReturnType<IntentResolver['resolve']>, tenantId: string, signals: RoutingSignals): Promise<ExecutionReceipt>;
}
export declare class WorkflowOrchestrator {
    private readonly engine;
    private readonly taskDetector;
    private readonly intentResolver;
    private readonly healthAggregator;
    private readonly eventBus;
    private readonly config;
    private readonly failureHistory;
    constructor(engine: ExecutionEngine, taskDetector: TaskDetector, intentResolver: IntentResolver, healthAggregator: HealthAggregator, eventBus: EventBus, config?: Partial<OrchestratorConfig>);
    processNext(): Promise<WorkflowResult | null>;
    processAll(): Promise<WorkflowResult[]>;
    private processItem;
    private recordFailure;
    getFailureHistory(): Readonly<Record<string, number>>;
}
