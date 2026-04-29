import { TraceDecision } from '../trace/types.js';
export interface Explanation {
    decisionId: string;
    explanation: string;
}
export declare class ExplainabilityLayer {
    explainDecision(decision: TraceDecision): Explanation;
    explainRun(decisions: TraceDecision[], fallbackTriggered: boolean, degraded: boolean): string[];
}
