export type KbVarScope = 'global' | 'device' | 'session' | 'user';

export interface KbVar<T = string | Record<string, unknown>> {
  key: string;
  value: T;
  scope: KbVarScope;
  freshness: number;
  confidence: number;
  derived?: boolean;
}

export interface KbLookupResult {
  match: KbVar | undefined;
  strategy: 'exact' | 'fuzzy' | 'none';
  score: number;
}

export class KbVarStore {
  private readonly data = new Map<string, KbVar>();

  upsert(candidate: KbVar): { accepted: boolean; reason: string } {
    const existing = this.data.get(candidate.key);
    if (!existing) {
      this.data.set(candidate.key, candidate);
      return { accepted: true, reason: 'inserted' };
    }

    const isNewer = candidate.freshness > existing.freshness;
    const hasHigherConfidence = candidate.confidence > existing.confidence;
    if (isNewer || hasHigherConfidence) {
      this.data.set(candidate.key, candidate);
      return { accepted: true, reason: isNewer ? 'newer' : 'higher-confidence' };
    }

    return { accepted: false, reason: 'stale-or-lower-confidence' };
  }

  get(key: string): KbVar | undefined {
    return this.data.get(key);
  }

  lookup(query: string): KbLookupResult {
    const exact = this.get(query);
    if (exact) return { match: exact, strategy: 'exact', score: 1 };

    const queryTokens = tokenize(query);
    let best: { entry: KbVar; score: number } | undefined;
    for (const entry of this.data.values()) {
      const score = fuzzyScore(entry.key, queryTokens);
      if (!best || score > best.score || (score === best.score && entry.key < best.entry.key)) {
        best = { entry, score };
      }
    }

    if (!best || best.score <= 0) {
      return { match: undefined, strategy: 'none', score: 0 };
    }

    return { match: best.entry, strategy: 'fuzzy', score: best.score };
  }
}

export type ExecutionStrategy = 'kb-variables' | 'rules-templates' | 'recursive-lm' | 'full-model' | 'reject';

export interface ResourceEstimate {
  tokens: number;
  memoryMb: number;
  latencyMs: number;
}

export interface ExecutionPlan {
  strategy: ExecutionStrategy;
  reason: string;
  resourceEstimate: ResourceEstimate;
  recursionDepth: number;
  quantization?: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0';
  degraded: boolean;
}

export interface PlanInput {
  requestKey: string;
  prompt: string;
  kbStore: KbVarStore;
  maxRecursionDepth: number;
  maxRecursiveTokens: number;
  memoryBudgetMb: number;
  allowFullModel: boolean;
  qualityMode: 'default' | 'high';
}

const RULE_TEMPLATES: Array<{ prefix: string; response: string }> = [
  { prefix: 'health-check', response: 'status:ok' },
  { prefix: 'runtime-mode', response: 'mode:local-first' }
];

export function chooseQuantization(memoryBudgetMb: number, qualityMode: 'default' | 'high'): 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' {
  if (qualityMode === 'high' && memoryBudgetMb >= 12288) return 'Q8_0';
  if (qualityMode === 'high' && memoryBudgetMb >= 6144) return 'Q5_K_M';
  return 'Q4_K_M';
}

export function planExecution(input: PlanInput): ExecutionPlan {
  const tokens = estimateTokens(input.prompt);

  const kbMatch = input.kbStore.lookup(input.requestKey);
  if (kbMatch.match && kbMatch.strategy !== 'none') {
    return {
      strategy: 'kb-variables',
      reason: `resolved via ${kbMatch.strategy} KB lookup`,
      resourceEstimate: { tokens: 0, memoryMb: 0, latencyMs: 1 },
      recursionDepth: 0,
      degraded: false
    };
  }

  const template = RULE_TEMPLATES.find((rule) => input.requestKey.startsWith(rule.prefix));
  if (template) {
    return {
      strategy: 'rules-templates',
      reason: `deterministic template matched: ${template.prefix}`,
      resourceEstimate: { tokens: 0, memoryMb: 1, latencyMs: 2 },
      recursionDepth: 0,
      degraded: false
    };
  }

  if (tokens <= input.maxRecursiveTokens) {
    const recursionDepth = Math.max(1, Math.min(input.maxRecursionDepth, Math.ceil(tokens / 128)));
    return {
      strategy: 'recursive-lm',
      reason: 'fits bounded recursive passes; avoids full-model inference',
      resourceEstimate: { tokens, memoryMb: 512, latencyMs: 30 * recursionDepth },
      recursionDepth,
      quantization: chooseQuantization(input.memoryBudgetMb, 'default'),
      degraded: false
    };
  }

  if (!input.allowFullModel) {
    return {
      strategy: 'reject',
      reason: 'task exceeds recursive budget and full-model inference is disabled',
      resourceEstimate: { tokens, memoryMb: 0, latencyMs: 0 },
      recursionDepth: 0,
      degraded: true
    };
  }

  const quantization = chooseQuantization(input.memoryBudgetMb, input.qualityMode);
  const memoryRequired = quantization === 'Q8_0' ? 8192 : quantization === 'Q5_K_M' ? 4096 : 3072;
  if (input.memoryBudgetMb < memoryRequired) {
    return {
      strategy: 'reject',
      reason: `insufficient memory for ${quantization} inference`,
      resourceEstimate: { tokens, memoryMb: memoryRequired, latencyMs: 0 },
      recursionDepth: 0,
      quantization,
      degraded: true
    };
  }

  return {
    strategy: 'full-model',
    reason: 'fallback to full inference after KB, templates, and recursive path were exhausted',
    resourceEstimate: { tokens, memoryMb: memoryRequired, latencyMs: 240 },
    recursionDepth: 0,
    quantization,
    degraded: false
  };
}

function estimateTokens(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.split(/\s+/).length * 1.3);
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function fuzzyScore(candidate: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const lowered = candidate.toLowerCase();
  const overlap = queryTokens.filter((token) => lowered.includes(token)).length / queryTokens.length;
  const prefix = queryTokens.some((token) => lowered.startsWith(token)) ? 0.3 : 0;
  return Number((overlap + prefix).toFixed(4));
}
