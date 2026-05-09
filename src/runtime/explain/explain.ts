import { TraceDecision } from '../trace/types.js';

export interface Explanation {
  decisionId: string;
  explanation: string;
}

export class ExplainabilityLayer {
  public explainDecision(decision: TraceDecision): Explanation {
    return {
      decisionId: decision.id,
      explanation: `Decision Context: ${decision.context}. ` +
                   `Chosen: '${decision.chosenOption}' over alternatives [${decision.alternatives.join(', ')}]. ` +
                   `Reason: ${decision.reason}`
    };
  }

  public explainRun(decisions: TraceDecision[], fallbackTriggered: boolean, degraded: boolean): string[] {
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
