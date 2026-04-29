import type {
  ActionableInsight,
  HistoricalRun,
  PatternAnalysis,
  PatternTrend,
  ProviderTaskPattern
} from './types.js';

export interface PatternEngineConfig {
  minSamplesForPattern: number;
  successThreshold: number;
  failureThreshold: number;
}

const DEFAULT_CONFIG: PatternEngineConfig = {
  minSamplesForPattern: 3,
  successThreshold: 0.8,
  failureThreshold: 0.55
};

interface PatternBucket {
  provider: string;
  taskType: string;
  runs: HistoricalRun[];
}

export class PatternEngine {
  private readonly config: PatternEngineConfig;

  constructor(config: Partial<PatternEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyze(history: readonly HistoricalRun[]): PatternAnalysis {
    const runs = this.sortRuns(history);
    if (runs.length === 0) {
      return {
        historySize: 0,
        globalSuccessRate: 0,
        patterns: [],
        successPatterns: [],
        failurePatterns: [],
        insights: [
          {
            id: 'history-empty',
            severity: 'warning',
            title: 'No execution history available',
            recommendation: 'Run with audit logging enabled before trusting predictive routing decisions.',
            evidence: ['0 historical runs analyzed'],
            confidence: 1
          }
        ],
        degraded: true,
        degradedReason: 'insufficient history'
      };
    }

    const patterns = [...this.groupByProviderAndTask(runs).values()]
      .map((bucket) => this.toPattern(bucket))
      .sort(comparePatterns);
    const successPatterns = patterns
      .filter((pattern) => pattern.attempts >= this.config.minSamplesForPattern && pattern.successRate >= this.config.successThreshold)
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore || comparePatterns(a, b));
    const failurePatterns = patterns
      .filter((pattern) => pattern.attempts >= this.config.minSamplesForPattern && pattern.successRate <= this.config.failureThreshold)
      .sort((a, b) => a.successRate - b.successRate || comparePatterns(a, b));

    const successes = runs.filter((run) => run.success).length;
    const globalSuccessRate = round(successes / runs.length);
    const insights = this.buildInsights(successPatterns, failurePatterns, runs.length);
    const degraded = runs.length < this.config.minSamplesForPattern;

    return {
      historySize: runs.length,
      globalSuccessRate,
      patterns,
      successPatterns,
      failurePatterns,
      insights,
      degraded,
      degradedReason: degraded ? `need at least ${this.config.minSamplesForPattern} runs for stable patterns` : null
    };
  }

  private groupByProviderAndTask(runs: HistoricalRun[]): Map<string, PatternBucket> {
    const groups = new Map<string, PatternBucket>();
    for (const run of runs) {
      const key = `${run.provider}\u0000${run.taskType}`;
      const existing = groups.get(key);
      if (existing) {
        existing.runs.push(run);
      } else {
        groups.set(key, { provider: run.provider, taskType: run.taskType, runs: [run] });
      }
    }
    return groups;
  }

  private toPattern(bucket: PatternBucket): ProviderTaskPattern {
    const attempts = bucket.runs.length;
    const successes = bucket.runs.filter((run) => run.success).length;
    const failures = attempts - successes;
    const degradedCount = bucket.runs.filter((run) => run.degradedState !== 'NOMINAL').length;
    const successRate = round(successes / attempts);
    const degradedRate = round(degradedCount / attempts);
    const averageLatencyMs = Math.round(bucket.runs.reduce((sum, run) => sum + run.latencyMs, 0) / attempts);
    const averageCostUsd = roundMoney(bucket.runs.reduce((sum, run) => sum + run.costUsd, 0) / attempts);
    const latencyScore = Math.max(0, 1 - averageLatencyMs / 5000);
    const costScore = 1 / (1 + averageCostUsd * 100);
    const reliabilityScore = round(successRate * 0.65 + (1 - degradedRate) * 0.2 + latencyScore * 0.1 + costScore * 0.05);
    const confidence = round(Math.min(1, attempts / (this.config.minSamplesForPattern * 4)));

    return {
      provider: bucket.provider,
      taskType: bucket.taskType,
      attempts,
      successes,
      failures,
      successRate,
      degradedRate,
      averageLatencyMs,
      averageCostUsd,
      reliabilityScore,
      confidence,
      trend: this.detectTrend(bucket.runs),
      commonErrors: commonErrors(bucket.runs)
    };
  }

  private detectTrend(runs: HistoricalRun[]): PatternTrend {
    if (runs.length < this.config.minSamplesForPattern * 2) {
      return 'insufficient-data';
    }
    const midpoint = Math.floor(runs.length / 2);
    const first = successRate(runs.slice(0, midpoint));
    const second = successRate(runs.slice(midpoint));
    const delta = second - first;
    if (delta >= 0.15) return 'improving';
    if (delta <= -0.15) return 'declining';
    return 'stable';
  }

  private buildInsights(
    successPatterns: ProviderTaskPattern[],
    failurePatterns: ProviderTaskPattern[],
    historySize: number
  ): ActionableInsight[] {
    const insights: ActionableInsight[] = [];
    for (const pattern of failurePatterns.slice(0, 3)) {
      insights.push({
        id: `avoid-${pattern.provider}-${pattern.taskType}`,
        severity: pattern.successRate < 0.35 ? 'critical' : 'warning',
        title: `${pattern.provider} is underperforming for ${pattern.taskType}`,
        recommendation: `Route ${pattern.taskType} away from ${pattern.provider} until reliability improves.`,
        evidence: [
          `${pattern.successes}/${pattern.attempts} successful runs`,
          `${Math.round(pattern.degradedRate * 100)}% degraded rate`,
          ...pattern.commonErrors.slice(0, 2)
        ],
        confidence: pattern.confidence
      });
    }
    for (const pattern of successPatterns.slice(0, 3)) {
      insights.push({
        id: `prefer-${pattern.provider}-${pattern.taskType}`,
        severity: 'info',
        title: `${pattern.provider} is a strong path for ${pattern.taskType}`,
        recommendation: `Prefer ${pattern.provider} for ${pattern.taskType} when policy and availability allow it.`,
        evidence: [
          `${pattern.successes}/${pattern.attempts} successful runs`,
          `${pattern.averageLatencyMs}ms average latency`,
          `$${pattern.averageCostUsd.toFixed(6)} average cost`
        ],
        confidence: pattern.confidence
      });
    }

    return insights.length > 0
      ? insights.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id))
      : [
          {
            id: 'patterns-neutral',
            severity: 'info',
            title: 'No dominant success or failure pattern yet',
            recommendation: 'Keep collecting audited runs before changing routing policy.',
            evidence: [`${historySize} historical runs analyzed`],
            confidence: round(Math.min(1, historySize / (this.config.minSamplesForPattern * 4)))
          }
        ];
  }

  private sortRuns(history: readonly HistoricalRun[]): HistoricalRun[] {
    return [...history].sort((a, b) => a.timestampIso.localeCompare(b.timestampIso) || a.runId.localeCompare(b.runId));
  }
}

function successRate(runs: HistoricalRun[]): number {
  if (runs.length === 0) return 0;
  return runs.filter((run) => run.success).length / runs.length;
}

function commonErrors(runs: HistoricalRun[]): string[] {
  const counts = new Map<string, number>();
  for (const run of runs) {
    if (!run.errorMessage) continue;
    counts.set(run.errorMessage, (counts.get(run.errorMessage) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([message, count]) => `${message} (${count})`);
}

function comparePatterns(a: ProviderTaskPattern, b: ProviderTaskPattern): number {
  return a.taskType.localeCompare(b.taskType) || a.provider.localeCompare(b.provider);
}

function severityRank(severity: ActionableInsight['severity']): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}
