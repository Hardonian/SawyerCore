import type { DecisionInput, ExecutionDecision, HistoricalRun } from './types.js';
export declare class DecisionEngine {
    private readonly history;
    private readonly patternEngine;
    private readonly predictionSystem;
    private readonly insightGenerator;
    constructor(history?: readonly HistoricalRun[]);
    recordOutcome(entry: HistoricalRun): void;
    decide(input: DecisionInput): ExecutionDecision;
    private scoreCandidate;
    private scoreReasons;
}
