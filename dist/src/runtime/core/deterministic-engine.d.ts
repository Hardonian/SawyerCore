/**
 * Deterministic execution engine.
 * Wraps the router with full provenance tracking:
 * - Hash-based run identity (input → output integrity)
 * - Replayable execution logs
 * - Explicit degraded state reporting
 */
import type { AiTask, InferenceResult } from '../../types/contracts.js';
import type { SawyerConfig } from '../../types/config.js';
import type { RoutingSignals } from '../optimization-engine.js';
import { ExecutionLog, type DegradedStateCode } from './execution-log.js';
import type { AuditLogger } from '../../observability/audit.js';
import type { RuntimeProvider } from '../../providers/provider.js';
export interface ExecutionReceipt {
    runId: string;
    inputHash: string;
    outputHash: string | null;
    decision: string;
    result: InferenceResult | undefined;
    degradedState: DegradedStateCode;
    reasons: string[];
    latencyMs: number;
}
export interface DeterministicEngineConfig {
    logFilePath?: string;
    logRotateBytes?: number;
    clock?: () => string;
}
export declare class DeterministicEngine {
    private readonly router;
    private readonly executionLog;
    private readonly configHash;
    private readonly providerNames;
    private readonly clock;
    constructor(providers: RuntimeProvider[], config: SawyerConfig, audit: AuditLogger, engineConfig?: DeterministicEngineConfig);
    execute(task: AiTask, tenantId: string, signals: RoutingSignals): Promise<ExecutionReceipt>;
    getLog(): ExecutionLog;
    verifyDeterminism(runId: string, expectedInputHash: string): boolean;
    verifyOutputIntegrity(runId: string, actualOutput: string): boolean;
    static hashInput(input: string): string;
    getProviderNames(): string[];
    getDegradedState(): DegradedStateCode;
}
