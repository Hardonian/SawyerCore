import { UnifiedExecutionGraph, type UnifiedExecutionReceipt } from '../system/execution-graph.js';
export declare function getExecutionGraph(): Promise<UnifiedExecutionGraph>;
export declare function runTask(tenantId: string, taskInput: {
    type: string;
    input: string;
    model?: string;
    parameters?: Record<string, unknown>;
    privacy?: 'public' | 'private' | 'sensitive';
}): Promise<{
    runId: string;
    output: unknown;
    provider: string;
    latencyMs: number;
    tokensUsed?: number;
    degradedState: string;
    reasons: string[];
    graph: UnifiedExecutionReceipt['graph'];
}>;
export declare function getAvailableProviders(): Promise<string[]>;
export declare function getEngineStatus(): Promise<{
    healthy: boolean;
    providers: string[];
    degradedState: string;
    cacheSize: number;
    historySize: number;
}>;
