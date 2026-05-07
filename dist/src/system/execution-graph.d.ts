import { AuditLogger } from '../observability/audit.js';
import type { RuntimeProvider } from '../providers/provider.js';
import { type CompressionResult, type ContextBlock } from '../runtime/compression/compression-engine.js';
import { type ExecutionReceipt } from '../runtime/core/deterministic-engine.js';
import type { RoutingSignals } from '../runtime/optimization-engine.js';
import { type DecisionObjective, type ExecutionDecision, type HistoricalRun } from '../intelligence/index.js';
import type { AiTask } from '../types/contracts.js';
import type { SawyerConfig } from '../types/config.js';
export type ExecutionGraphStageStatus = 'passed' | 'degraded' | 'blocked' | 'skipped';
export interface ExecutionGraphStage {
    name: string;
    status: ExecutionGraphStageStatus;
    reason: string;
}
export interface ExecutionGraphConfig {
    cacheTtlMs: number;
    cacheSimilarityThreshold: number;
    compressionTokenBudget: number;
    recordUsage: boolean;
    defaultSignals: RoutingSignals;
    decisionObjective: DecisionObjective;
    clock: () => string;
}
export interface UnifiedExecutionInput {
    task: AiTask;
    tenantId: string;
    signals?: Partial<RoutingSignals>;
    contextBlocks?: ContextBlock[];
    requiredTerms?: string[];
    agentRun?: boolean;
}
export interface ExecutionGraphTrace {
    stages: ExecutionGraphStage[];
    cache: {
        hit: boolean;
        reason: string;
        semanticHash: string;
        matchedHash: string | null;
    };
    compression: {
        applied: boolean;
        originalTokenEstimate: number;
        finalTokenEstimate: number;
        reductionPercent: number;
        qualityStatus: CompressionResult['qualityGate']['status'] | 'not_required';
        reason: string;
    };
    decision: ExecutionDecision;
    billing: {
        recorded: boolean;
        records: number;
        reason: string;
    };
    optimization: {
        historySize: number;
        failureHistory: Record<string, number>;
        preferredProviderName: string | null;
    };
}
export type UnifiedExecutionReceipt = ExecutionReceipt & {
    graph: ExecutionGraphTrace;
};
export declare class UnifiedExecutionGraph {
    private readonly providers;
    private readonly config;
    private readonly audit;
    private readonly billing;
    private readonly deterministicEngine;
    private readonly compressionEngine;
    private readonly semanticCache;
    private readonly decisionEngine;
    private readonly graphConfig;
    private readonly providerNames;
    private readonly configHash;
    private readonly history;
    private readonly failureHistory;
    constructor(providers: RuntimeProvider[], config?: SawyerConfig, audit?: AuditLogger, options?: Partial<ExecutionGraphConfig>);
    execute(task: AiTask, tenantId: string, signals: RoutingSignals): Promise<UnifiedExecutionReceipt>;
    run(input: UnifiedExecutionInput): Promise<UnifiedExecutionReceipt>;
    getHistory(): readonly HistoricalRun[];
    recordHistoricalOutcome(entry: HistoricalRun): void;
    getFailureHistory(): Readonly<Record<string, number>>;
    getProviderNames(): string[];
    getCacheSize(): number;
    private prepareTask;
    private buildCandidates;
    private recordUsage;
    private recordOutcome;
    private receiptFromCached;
    private blockedReceipt;
    private blockedDecision;
    private cachedDecision;
    private buildTrace;
    private validateSecurity;
    private mergeSignals;
}
