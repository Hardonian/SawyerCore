import type { OutcomeForecast, PatternAnalysis, PredictionCandidate } from './types.js';
export declare class PredictionSystem {
    forecast(candidate: PredictionCandidate, analysis: PatternAnalysis): OutcomeForecast;
    forecastAll(candidates: readonly PredictionCandidate[], analysis: PatternAnalysis): OutcomeForecast[];
    private blockedForecast;
    private riskReasons;
}
