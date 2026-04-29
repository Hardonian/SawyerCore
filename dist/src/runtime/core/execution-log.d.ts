/**
 * Replayable execution log — append-only JSONL with full provenance.
 * Every execution is recorded with input/output hashes for integrity verification.
 */
export type DegradedStateCode = 'NOMINAL' | 'MODEL_UNAVAILABLE' | 'LOW_MEMORY' | 'PARTIAL_EXECUTION';
export interface ExecutionLogEntry {
    runId: string;
    inputHash: string;
    outputHash: string | null;
    provider: string;
    model: string;
    taskType: string;
    degradedState: DegradedStateCode;
    latencyMs: number;
    costUsd: number;
    success: boolean;
    errorMessage: string | null;
    timestampIso: string;
}
export interface ExecutionLogConfig {
    filePath: string;
    rotateBytes: number;
}
export declare class ExecutionLog {
    private readonly config;
    private readonly entries;
    constructor(config?: Partial<ExecutionLogConfig>);
    append(entry: ExecutionLogEntry): void;
    getEntries(): readonly ExecutionLogEntry[];
    findByRunId(runId: string): ExecutionLogEntry | undefined;
    getLatest(): ExecutionLogEntry | undefined;
    replay(): ExecutionLogEntry[];
    private persistEntry;
}
