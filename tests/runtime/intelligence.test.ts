import { describe, expect, it } from 'vitest';
import { DecisionEngine, PatternEngine, PredictionSystem, type HistoricalRun, type PredictionCandidate } from '../../src/intelligence/index.js';
import type { AiTask } from '../../src/types/contracts.js';

const task: AiTask = {
  id: 'intel-1',
  type: 'chat',
  input: 'summarize the incident',
  inputClassification: 'public',
  requiredCapability: 'chat',
  latencyPreferenceMs: 200,
  privacyRequirement: 'cloud-allowed',
  maxBudgetUsd: 0.02,
  fallbackAllowed: true,
  maxContextTokens: 1000
};

const fastFlaky: PredictionCandidate = {
  provider: 'fast-flaky',
  target: 'LOCAL_GPU',
  taskType: 'chat',
  estimatedLatencyMs: 80,
  estimatedCostUsd: 0,
  available: true,
  supportsTask: true
};

const steadyLocal: PredictionCandidate = {
  provider: 'steady-local',
  target: 'LOCAL_CPU',
  taskType: 'chat',
  estimatedLatencyMs: 180,
  estimatedCostUsd: 0,
  available: true,
  supportsTask: true
};

describe('intelligence layer', () => {
  it('detects provider success and failure patterns from historical runs', () => {
    const analysis = new PatternEngine().analyze([
      run('steady-local', true, 120, 0, 1),
      run('steady-local', true, 130, 0, 2),
      run('steady-local', true, 125, 0, 3),
      run('fast-flaky', false, 70, 0, 4, 'timeout'),
      run('fast-flaky', false, 75, 0, 5, 'timeout'),
      run('fast-flaky', true, 65, 0, 6)
    ]);

    expect(analysis.degraded).toBe(false);
    expect(analysis.successPatterns[0]?.provider).toBe('steady-local');
    expect(analysis.failurePatterns[0]?.provider).toBe('fast-flaky');
    expect(analysis.insights.some((insight) => insight.recommendation.includes('Route chat away from fast-flaky'))).toBe(true);
  });

  it('forecasts outcomes using matching provider/task history', () => {
    const analysis = new PatternEngine().analyze([
      run('steady-local', true, 120, 0.001, 1),
      run('steady-local', true, 140, 0.001, 2),
      run('steady-local', false, 160, 0.001, 3, 'model unavailable')
    ]);

    const forecast = new PredictionSystem().forecast(steadyLocal, analysis);

    expect(forecast.predictedSuccessRate).toBeCloseTo(0.6667, 4);
    expect(forecast.predictedLatencyMs).toBe(140);
    expect(forecast.riskReasons).toContain('predicted success rate 67%');
  });

  it('chooses the historically better execution path over the fastest path', () => {
    const decision = new DecisionEngine([
      run('fast-flaky', false, 70, 0, 1, 'timeout'),
      run('fast-flaky', false, 75, 0, 2, 'timeout'),
      run('fast-flaky', true, 65, 0, 3),
      run('steady-local', true, 150, 0, 4),
      run('steady-local', true, 155, 0, 5),
      run('steady-local', true, 160, 0, 6)
    ]).decide({
      task,
      candidates: [fastFlaky, steadyLocal],
      objective: { reliabilityWeight: 0.7, performanceWeight: 0.2, costWeight: 0.1 }
    });

    expect(decision.selectedProvider).toBe('steady-local');
    expect(decision.actions.join(' ')).toContain('predicted success improves');
    expect(decision.scores[0]?.candidate.provider).toBe('steady-local');
  });

  it('improves recommendations as new outcomes are recorded', () => {
    const engine = new DecisionEngine([
      run('fast-flaky', true, 70, 0, 1),
      run('steady-local', true, 160, 0, 2)
    ]);

    const earlyDecision = engine.decide({ task, candidates: [fastFlaky, steadyLocal] });
    expect(earlyDecision.selectedProvider).toBe('fast-flaky');
    expect(earlyDecision.degraded).toBe(true);

    engine.recordOutcome(run('fast-flaky', false, 70, 0, 3, 'timeout'));
    engine.recordOutcome(run('fast-flaky', false, 75, 0, 4, 'timeout'));
    engine.recordOutcome(run('steady-local', true, 155, 0, 5));
    engine.recordOutcome(run('steady-local', true, 150, 0, 6));

    const learnedDecision = engine.decide({ task, candidates: [fastFlaky, steadyLocal] });
    expect(learnedDecision.selectedProvider).toBe('steady-local');
    expect(learnedDecision.selectedForecast?.predictedSuccessRate).toBe(1);
  });

  it('honors explicit cost versus performance tradeoffs', () => {
    const fastExpensive: PredictionCandidate = {
      provider: 'fast-expensive',
      target: 'CLOUD_FALLBACK',
      taskType: 'chat',
      estimatedLatencyMs: 70,
      estimatedCostUsd: 0.02,
      available: true,
      supportsTask: true
    };
    const cheapSteady: PredictionCandidate = {
      provider: 'cheap-steady',
      target: 'LOCAL_CPU',
      taskType: 'chat',
      estimatedLatencyMs: 180,
      estimatedCostUsd: 0,
      available: true,
      supportsTask: true
    };
    const history = [
      run('fast-expensive', true, 70, 0.02, 1),
      run('fast-expensive', true, 75, 0.02, 2),
      run('fast-expensive', true, 80, 0.02, 3),
      run('cheap-steady', true, 180, 0, 4),
      run('cheap-steady', true, 185, 0, 5),
      run('cheap-steady', true, 190, 0, 6)
    ];

    const performanceDecision = new DecisionEngine(history).decide({
      task,
      candidates: [fastExpensive, cheapSteady],
      objective: { reliabilityWeight: 0.2, performanceWeight: 0.7, costWeight: 0.1 }
    });
    const costDecision = new DecisionEngine(history).decide({
      task,
      candidates: [fastExpensive, cheapSteady],
      objective: { reliabilityWeight: 0.2, performanceWeight: 0.1, costWeight: 0.7 }
    });

    expect(performanceDecision.selectedProvider).toBe('fast-expensive');
    expect(costDecision.selectedProvider).toBe('cheap-steady');
  });

  it('fails closed when no candidate is viable', () => {
    const decision = new DecisionEngine().decide({
      task,
      candidates: [{ ...fastFlaky, available: false }]
    });

    expect(decision.selectedTarget).toBe('DENY');
    expect(decision.degraded).toBe(true);
    expect(decision.degradedReason).toBe('no viable execution path');
  });
});

function run(
  provider: string,
  success: boolean,
  latencyMs: number,
  costUsd: number,
  sequence: number,
  errorMessage: string | null = null
): HistoricalRun {
  return {
    runId: `${provider}-${sequence}`,
    inputHash: `input-${sequence}`,
    outputHash: success ? `output-${sequence}` : null,
    provider,
    model: `${provider}-model`,
    taskType: 'chat',
    degradedState: success ? 'NOMINAL' : 'MODEL_UNAVAILABLE',
    latencyMs,
    costUsd,
    success,
    errorMessage,
    timestampIso: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`
  };
}
