export class PredictionSystem {
    forecast(candidate, analysis) {
        if (!candidate.available) {
            return this.blockedForecast(candidate, 'candidate unavailable');
        }
        if (!candidate.supportsTask) {
            return this.blockedForecast(candidate, 'candidate does not support task');
        }
        const exactPattern = analysis.patterns.find((pattern) => pattern.provider === candidate.provider && pattern.taskType === candidate.taskType);
        const providerPatterns = analysis.patterns.filter((pattern) => pattern.provider === candidate.provider);
        const taskPatterns = analysis.patterns.filter((pattern) => pattern.taskType === candidate.taskType);
        const predictedSuccessRate = round(exactPattern?.successRate
            ?? weightedAverage(providerPatterns, 'successRate')
            ?? weightedAverage(taskPatterns, 'successRate')
            ?? (analysis.historySize > 0 ? analysis.globalSuccessRate : 0.5));
        const predictedLatencyMs = Math.round(exactPattern?.averageLatencyMs
            ?? weightedAverage(providerPatterns, 'averageLatencyMs')
            ?? candidate.estimatedLatencyMs);
        const predictedCostUsd = roundMoney(exactPattern?.averageCostUsd
            ?? weightedAverage(providerPatterns, 'averageCostUsd')
            ?? candidate.estimatedCostUsd);
        const confidence = round(exactPattern?.confidence
            ?? Math.min(0.65, Math.max(0.15, analysis.historySize / 40)));
        const riskReasons = this.riskReasons(exactPattern, predictedSuccessRate, analysis.historySize);
        const risk = riskReasons.length >= 2 || predictedSuccessRate < 0.55 ? 'high' : riskReasons.length === 1 ? 'medium' : 'low';
        const degraded = !exactPattern || confidence < 0.35;
        return {
            provider: candidate.provider,
            target: candidate.target,
            taskType: candidate.taskType,
            predictedSuccessRate,
            predictedLatencyMs,
            predictedCostUsd,
            confidence,
            risk,
            riskReasons,
            degraded,
            degradedReason: degraded ? 'forecast based on limited matching history' : null
        };
    }
    forecastAll(candidates, analysis) {
        return candidates
            .map((candidate) => this.forecast(candidate, analysis))
            .sort((a, b) => b.predictedSuccessRate - a.predictedSuccessRate || a.provider.localeCompare(b.provider));
    }
    blockedForecast(candidate, reason) {
        return {
            provider: candidate.provider,
            target: candidate.target,
            taskType: candidate.taskType,
            predictedSuccessRate: 0,
            predictedLatencyMs: candidate.estimatedLatencyMs,
            predictedCostUsd: candidate.estimatedCostUsd,
            confidence: 1,
            risk: 'high',
            riskReasons: [reason],
            degraded: true,
            degradedReason: reason
        };
    }
    riskReasons(pattern, predictedSuccessRate, historySize) {
        const reasons = [];
        if (historySize === 0) {
            reasons.push('no historical runs available');
        }
        if (predictedSuccessRate < 0.7) {
            reasons.push(`predicted success rate ${Math.round(predictedSuccessRate * 100)}%`);
        }
        if (pattern?.degradedRate && pattern.degradedRate > 0.25) {
            reasons.push(`degraded in ${Math.round(pattern.degradedRate * 100)}% of matching runs`);
        }
        if (pattern?.trend === 'declining') {
            reasons.push('recent matching outcomes are declining');
        }
        return reasons;
    }
}
function weightedAverage(patterns, key) {
    const attempts = patterns.reduce((sum, pattern) => sum + pattern.attempts, 0);
    if (attempts === 0)
        return undefined;
    return patterns.reduce((sum, pattern) => sum + pattern[key] * pattern.attempts, 0) / attempts;
}
function round(value) {
    return Number(value.toFixed(4));
}
function roundMoney(value) {
    return Number(value.toFixed(6));
}
