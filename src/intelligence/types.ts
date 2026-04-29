import type { ProviderTarget } from '../providers/provider.js';
import type { ExecutionLogEntry } from '../runtime/core/execution-log.js';
import type { AiTask, TaskType } from '../types/contracts.js';

export type HistoricalRun = ExecutionLogEntry;

export type PatternTrend = 'improving' | 'declining' | 'stable' | 'insufficient-data';

export interface ProviderTaskPattern {
  provider: string;
  taskType: string;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  degradedRate: number;
  averageLatencyMs: number;
  averageCostUsd: number;
  reliabilityScore: number;
  confidence: number;
  trend: PatternTrend;
  commonErrors: string[];
}

export interface ActionableInsight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  recommendation: string;
  evidence: string[];
  confidence: number;
}

export interface PatternAnalysis {
  historySize: number;
  globalSuccessRate: number;
  patterns: ProviderTaskPattern[];
  successPatterns: ProviderTaskPattern[];
  failurePatterns: ProviderTaskPattern[];
  insights: ActionableInsight[];
  degraded: boolean;
  degradedReason: string | null;
}

export interface PredictionCandidate {
  provider: string;
  target: ProviderTarget;
  taskType: TaskType;
  estimatedLatencyMs: number;
  estimatedCostUsd: number;
  available: boolean;
  supportsTask: boolean;
  privateDataSupported?: boolean;
}

export interface OutcomeForecast {
  provider: string;
  target: ProviderTarget;
  taskType: TaskType;
  predictedSuccessRate: number;
  predictedLatencyMs: number;
  predictedCostUsd: number;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  riskReasons: string[];
  degraded: boolean;
  degradedReason: string | null;
}

export interface DecisionObjective {
  reliabilityWeight: number;
  performanceWeight: number;
  costWeight: number;
}

export interface DecisionCandidateScore {
  candidate: PredictionCandidate;
  forecast: OutcomeForecast;
  score: number;
  blocked: boolean;
  reasons: string[];
}

export interface ExecutionDecision {
  taskId: string;
  selectedProvider: string | null;
  selectedTarget: ProviderTarget | 'DENY';
  selectedForecast: OutcomeForecast | null;
  scores: DecisionCandidateScore[];
  objective: DecisionObjective;
  actions: string[];
  insights: ActionableInsight[];
  degraded: boolean;
  degradedReason: string | null;
}

export interface DecisionInput {
  task: AiTask;
  candidates: PredictionCandidate[];
  history?: HistoricalRun[];
  objective?: Partial<DecisionObjective>;
}
