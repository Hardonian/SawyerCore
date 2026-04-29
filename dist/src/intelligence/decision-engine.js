import { PatternEngine } from './pattern-engine.js';
import { PredictionSystem } from './prediction-system.js';
import { InsightGenerator } from './insight-generator.js';
const DEFAULT_OBJECTIVE = {
    reliabilityWeight: 0.55,
    performanceWeight: 0.25,
    costWeight: 0.2
};
export class DecisionEngine {
    history;
    patternEngine;
    predictionSystem;
    insightGenerator;
    constructor(history = []) {
        this.history = [...history];
        this.patternEngine = new PatternEngine();
        this.predictionSystem = new PredictionSystem();
        this.insightGenerator = new InsightGenerator();
    }
    recordOutcome(entry) {
        this.history.push(entry);
    }
    decide(input) {
        const history = input.history ? [...this.history, ...input.history] : this.history;
        const analysis = this.patternEngine.analyze(history);
        const objective = normalizeObjective(input.objective);
        const scores = input.candidates
            .map((candidate) => this.scoreCandidate(candidate, this.predictionSystem.forecast(candidate, analysis), objective, input.task.latencyPreferenceMs, input.task.maxBudgetUsd))
            .sort((a, b) => Number(a.blocked) - Number(b.blocked)
            || b.score - a.score
            || a.candidate.provider.localeCompare(b.candidate.provider));
        const selected = scores.find((score) => !score.blocked);
        const insights = this.insightGenerator.generateDecisionInsights(analysis, scores);
        if (!selected) {
            return {
                taskId: input.task.id,
                selectedProvider: null,
                selectedTarget: 'DENY',
                selectedForecast: null,
                scores,
                objective,
                actions: ['Deny execution until at least one available candidate supports the task.'],
                insights,
                degraded: true,
                degradedReason: 'no viable execution path'
            };
        }
        const alternatives = scores.filter((score) => score !== selected && !score.blocked);
        const actions = [
            `Route ${input.task.type} to ${selected.candidate.provider}.`,
            ...alternatives
                .filter((score) => selected.forecast.predictedSuccessRate - score.forecast.predictedSuccessRate >= 0.15)
                .slice(0, 2)
                .map((score) => `Prefer ${selected.candidate.provider} over ${score.candidate.provider}: predicted success improves by ${Math.round((selected.forecast.predictedSuccessRate - score.forecast.predictedSuccessRate) * 100)} points.`)
        ];
        return {
            taskId: input.task.id,
            selectedProvider: selected.candidate.provider,
            selectedTarget: selected.candidate.target,
            selectedForecast: selected.forecast,
            scores,
            objective,
            actions,
            insights,
            degraded: selected.forecast.degraded || analysis.degraded,
            degradedReason: selected.forecast.degradedReason ?? analysis.degradedReason
        };
    }
    scoreCandidate(candidate, forecast, objective, latencyPreferenceMs, maxBudgetUsd) {
        const blocked = !candidate.available || !candidate.supportsTask || forecast.predictedSuccessRate <= 0;
        const latencyLimit = Math.max(latencyPreferenceMs * 2, 1);
        const latencyScore = Math.max(0, 1 - forecast.predictedLatencyMs / latencyLimit);
        const budgetLimit = Math.max(maxBudgetUsd, candidate.estimatedCostUsd, 0.000001);
        const costScore = Math.max(0, 1 - forecast.predictedCostUsd / budgetLimit);
        const riskPenalty = forecast.risk === 'high' ? 20 : forecast.risk === 'medium' ? 8 : 0;
        const rawScore = forecast.predictedSuccessRate * objective.reliabilityWeight * 100
            + latencyScore * objective.performanceWeight * 100
            + costScore * objective.costWeight * 100
            - riskPenalty;
        return {
            candidate,
            forecast,
            score: blocked ? 0 : Number(Math.max(0, rawScore).toFixed(4)),
            blocked,
            reasons: blocked ? forecast.riskReasons : this.scoreReasons(forecast, latencyScore, costScore)
        };
    }
    scoreReasons(forecast, latencyScore, costScore) {
        return [
            `predicted success ${Math.round(forecast.predictedSuccessRate * 100)}%`,
            `latency score ${Math.round(latencyScore * 100)}%`,
            `cost score ${Math.round(costScore * 100)}%`,
            `confidence ${Math.round(forecast.confidence * 100)}%`
        ];
    }
}
function normalizeObjective(objective) {
    const merged = { ...DEFAULT_OBJECTIVE, ...objective };
    const total = merged.reliabilityWeight + merged.performanceWeight + merged.costWeight;
    if (total <= 0)
        return DEFAULT_OBJECTIVE;
    return {
        reliabilityWeight: Number((merged.reliabilityWeight / total).toFixed(4)),
        performanceWeight: Number((merged.performanceWeight / total).toFixed(4)),
        costWeight: Number((merged.costWeight / total).toFixed(4))
    };
}
