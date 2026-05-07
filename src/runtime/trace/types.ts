export type ExecutionOutcome = 'success' | 'failure' | 'degraded';

export interface TokenCost {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TraceCost {
  tokens?: TokenCost;
  timeMs: number;
  memoryBytes?: number;
}

export interface TraceDecision {
  id: string;
  context: string;
  chosenOption: string;
  alternatives: string[];
  reason: string;
}

export interface ExecutionTrace {
  traceId: string;
  timestamp: string;
  inputHash: string;
  executionPath: string[]; // agents, providers invoked
  decisions: TraceDecision[];
  cost: TraceCost;
  outcome: ExecutionOutcome;
  error?: string;
  fallbackUsage: boolean;
  qualitySignals?: Record<string, number>; // if measurable
}
