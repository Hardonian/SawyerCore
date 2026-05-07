import type { HistoricalRun, PatternAnalysis } from './types.js';
export interface PatternEngineConfig {
    minSamplesForPattern: number;
    successThreshold: number;
    failureThreshold: number;
}
export declare class PatternEngine {
    private readonly config;
    constructor(config?: Partial<PatternEngineConfig>);
    analyze(history: readonly HistoricalRun[]): PatternAnalysis;
    private groupByProviderAndTask;
    private toPattern;
    private detectTrend;
    private buildInsights;
    private sortRuns;
}
