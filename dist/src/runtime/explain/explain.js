export class ExplainabilityLayer {
    explainDecision(decision) {
        return {
            decisionId: decision.id,
            explanation: `Decision Context: ${decision.context}. ` +
                `Chosen: '${decision.chosenOption}' over alternatives [${decision.alternatives.join(', ')}]. ` +
                `Reason: ${decision.reason}`
        };
    }
    explainRun(decisions, fallbackTriggered, degraded) {
        const explanations = decisions.map(d => this.explainDecision(d).explanation);
        if (fallbackTriggered) {
            explanations.push('Fallback triggered due to primary provider failure or timeout.');
        }
        if (degraded) {
            explanations.push('Entered degraded state due to insufficient resources or critical errors.');
        }
        return explanations;
    }
}
