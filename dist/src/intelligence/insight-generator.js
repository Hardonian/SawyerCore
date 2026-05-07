export class InsightGenerator {
    generateDecisionInsights(analysis, scores) {
        const insights = [...analysis.insights];
        const viable = scores.filter((score) => !score.blocked);
        const highRisk = viable.filter((score) => score.forecast.risk === 'high');
        const lowConfidence = viable.filter((score) => score.forecast.confidence < 0.35);
        if (highRisk.length > 0) {
            insights.push({
                id: 'decision-high-risk-candidates',
                severity: 'warning',
                title: 'High-risk execution paths detected',
                recommendation: 'Avoid high-risk candidates unless all safer paths are blocked.',
                evidence: highRisk.map((score) => `${score.candidate.provider}: ${score.forecast.riskReasons.join('; ')}`),
                confidence: averageConfidence(highRisk)
            });
        }
        if (lowConfidence.length > 0) {
            insights.push({
                id: 'decision-low-confidence-history',
                severity: 'info',
                title: 'More matching history will improve recommendations',
                recommendation: 'Keep audit logging enabled and re-evaluate after additional runs for this task/provider mix.',
                evidence: lowConfidence.map((score) => `${score.candidate.provider}: ${score.forecast.degradedReason ?? 'low confidence'}`),
                confidence: 1
            });
        }
        return dedupeInsights(insights);
    }
}
function averageConfidence(scores) {
    if (scores.length === 0)
        return 0;
    return Number((scores.reduce((sum, score) => sum + score.forecast.confidence, 0) / scores.length).toFixed(4));
}
function dedupeInsights(insights) {
    const byId = new Map();
    for (const insight of insights) {
        byId.set(insight.id, insight);
    }
    return [...byId.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
}
function severityRank(severity) {
    if (severity === 'critical')
        return 3;
    if (severity === 'warning')
        return 2;
    return 1;
}
