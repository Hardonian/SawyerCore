import type { ActionableInsight, DecisionCandidateScore, PatternAnalysis } from './types.js';
export declare class InsightGenerator {
    generateDecisionInsights(analysis: PatternAnalysis, scores: readonly DecisionCandidateScore[]): ActionableInsight[];
}
