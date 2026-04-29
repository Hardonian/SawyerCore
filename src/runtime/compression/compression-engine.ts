import { RuleGraph, type RuleGraphData, type RuleNode } from '../memory/rule-graph.js';

export type QuantizationLevel = 'q4' | 'q8' | 'fp16';

export interface OptimizationModelCandidate {
  id: string;
  quantization: QuantizationLevel;
  contextLimit: number;
  estimatedRamGb: number;
  capabilities: string[];
  available: boolean;
  latencyRank: number;
}

export interface ModelSelectionConstraints {
  availableRamGb: number;
  requiredCapability: string;
  maxContextTokens: number;
  preferLowPower: boolean;
}

export interface ModelSelectionResult {
  status: 'selected' | 'degraded';
  modelId: string | null;
  quantization: QuantizationLevel | null;
  reason: string;
  candidatesConsidered: number;
}

export interface ContextBlock {
  id: string;
  text: string;
  weight?: number;
  tags?: string[];
}

export interface CompressionInput {
  instruction: string;
  contextBlocks: ContextBlock[];
  requiredTerms?: string[];
  tokenBudget?: number;
}

export interface QualityGate {
  status: 'passed' | 'degraded';
  retainedRequiredTerms: string[];
  missingRequiredTerms: string[];
  reason: string;
}

export interface CompressionResult {
  prompt: string;
  originalTokenEstimate: number;
  compressedTokenEstimate: number;
  reductionPercent: number;
  transformations: string[];
  qualityGate: QualityGate;
}

export interface WorkflowTemplate {
  id: string;
  variables: string[];
  steps: Array<{ id: string; command: string }>;
}

export interface CompressionEngineOptions {
  maxContextBlocks?: number;
  maxFactLength?: number;
  maxReductionPercent?: number;
}

const DEFAULT_MAX_CONTEXT_BLOCKS = 8;
const DEFAULT_MAX_FACT_LENGTH = 160;
const DEFAULT_MAX_REDUCTION_PERCENT = 80;
const WORD_PATTERN = /[a-z0-9][a-z0-9_-]*/gi;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'with'
]);

export class CompressionEngine {
  private readonly maxContextBlocks: number;
  private readonly maxFactLength: number;
  private readonly maxReductionPercent: number;

  constructor(options: CompressionEngineOptions = {}) {
    this.maxContextBlocks = options.maxContextBlocks ?? DEFAULT_MAX_CONTEXT_BLOCKS;
    this.maxFactLength = options.maxFactLength ?? DEFAULT_MAX_FACT_LENGTH;
    this.maxReductionPercent = options.maxReductionPercent ?? DEFAULT_MAX_REDUCTION_PERCENT;
  }

  compressPrompt(input: CompressionInput): CompressionResult {
    const original = [
      input.instruction,
      ...input.contextBlocks.map((block) => block.text)
    ].join('\n\n');
    const originalTokenEstimate = estimateTokens(original);
    const selectedBlocks = this.selectBlocks(input.contextBlocks, input.requiredTerms ?? []);
    const facts = selectedBlocks.flatMap((block) => this.extractFacts(block.text));
    const uniqueFacts = dedupeStable(facts).slice(0, this.maxContextBlocks);
    const compactContext = uniqueFacts.map((fact) => `- ${fact}`).join('\n');
    const prompt = compactContext.length > 0
      ? `${input.instruction.trim()}\n\nContext:\n${compactContext}`
      : input.instruction.trim();
    const bandedPrompt = this.retainEvidenceBand(prompt, selectedBlocks, originalTokenEstimate);
    const budgetedPrompt = this.applyBudget(bandedPrompt, input.tokenBudget);
    const compressedTokenEstimate = estimateTokens(budgetedPrompt);
    const reductionPercent = reductionPercentFrom(originalTokenEstimate, compressedTokenEstimate);
    const qualityGate = evaluateQualityGate(original, budgetedPrompt, input.requiredTerms ?? []);

    return {
      prompt: budgetedPrompt,
      originalTokenEstimate,
      compressedTokenEstimate,
      reductionPercent,
      transformations: [
        'dedupe_context_blocks',
        'extract_compact_facts',
        'stable_weighted_context_selection',
        ...(input.tokenBudget ? ['token_budget_trim'] : [])
      ],
      qualityGate
    };
  }

  selectModel(
    candidates: OptimizationModelCandidate[],
    constraints: ModelSelectionConstraints
  ): ModelSelectionResult {
    const eligible = candidates
      .filter((candidate) => candidate.available)
      .filter((candidate) => candidate.estimatedRamGb <= constraints.availableRamGb)
      .filter((candidate) => candidate.contextLimit >= constraints.maxContextTokens)
      .filter((candidate) => candidate.capabilities.includes(constraints.requiredCapability))
      .sort((a, b) => {
        const powerRank = quantizationPowerRank(a.quantization) - quantizationPowerRank(b.quantization);
        const latencyRank = a.latencyRank - b.latencyRank;
        const ramRank = a.estimatedRamGb - b.estimatedRamGb;
        const qualityRank = quantizationQualityRank(b.quantization) - quantizationQualityRank(a.quantization);
        return constraints.preferLowPower
          ? powerRank || latencyRank || ramRank || a.id.localeCompare(b.id)
          : qualityRank || latencyRank || ramRank || a.id.localeCompare(b.id);
      });

    const selected = eligible[0];
    if (!selected) {
      return {
        status: 'degraded',
        modelId: null,
        quantization: null,
        reason: 'no available model satisfies capability, context, and RAM constraints',
        candidatesConsidered: candidates.length
      };
    }

    return {
      status: 'selected',
      modelId: selected.id,
      quantization: selected.quantization,
      reason: `selected ${selected.quantization} tier within ${constraints.availableRamGb}GB RAM`,
      candidatesConsidered: candidates.length
    };
  }

  docsToRuleGraph(documentText: string): RuleGraphData {
    const lines = documentText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const nodes: RuleNode[] = [];

    for (const [index, line] of lines.entries()) {
      const normalized = line.replace(/^[-*#\d.\s]+/, '').trim();
      const rule = parseRuleLine(normalized);
      if (!rule) continue;
      nodes.push({
        id: `rule-${String(index + 1).padStart(3, '0')}`,
        condition: rule.condition,
        action: rule.action,
        weight: rule.weight
      });
    }

    return {
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        from: nodes[index].id,
        to: node.id,
        label: 'doc_order'
      }))
    };
  }

  evaluateDocumentRules(documentText: string, context: Record<string, string>): RuleNode[] {
    return new RuleGraph(this.docsToRuleGraph(documentText)).evaluate(context);
  }

  workflowToTemplate(id: string, workflowText: string): WorkflowTemplate {
    const steps = workflowText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => ({
        id: `step-${String(index + 1).padStart(2, '0')}`,
        command: normalizeWorkflowLine(line)
      }));
    const variables = [...new Set(steps.flatMap((step) => extractVariables(step.command)))].sort();
    return { id, variables, steps };
  }

  private selectBlocks(blocks: ContextBlock[], requiredTerms: string[]): ContextBlock[] {
    const seenFingerprints = new Set<string>();
    const selected: ContextBlock[] = [];
    const sorted = [...blocks].sort((a, b) => {
      const requiredScoreA = containsAnyTerm(a.text, requiredTerms) ? 1 : 0;
      const requiredScoreB = containsAnyTerm(b.text, requiredTerms) ? 1 : 0;
      return (
        requiredScoreB - requiredScoreA ||
        (b.weight ?? 0) - (a.weight ?? 0) ||
        a.id.localeCompare(b.id)
      );
    });

    for (const block of sorted) {
      const fingerprint = semanticFingerprint(block.text);
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);
      selected.push(block);
      if (selected.length >= this.maxContextBlocks) break;
    }

    return selected;
  }

  private extractFacts(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+|\r?\n/)
      .map((sentence) => sentence.trim().replace(/\s+/g, ' '))
      .filter((sentence) => sentence.length > 0)
      .map((sentence) => sentence.length > this.maxFactLength
        ? `${sentence.slice(0, this.maxFactLength - 1).trim()}`
        : sentence)
      .filter((sentence) => keywordTokens(sentence).length >= 2);
  }

  private applyBudget(prompt: string, tokenBudget: number | undefined): string {
    if (!tokenBudget || estimateTokens(prompt) <= tokenBudget) return prompt;
    const lines = prompt.split('\n');
    const retained: string[] = [];
    for (const line of lines) {
      const candidate = [...retained, line].join('\n');
      if (estimateTokens(candidate) > tokenBudget) break;
      retained.push(line);
    }
    return retained.join('\n').trim();
  }

  private retainEvidenceBand(prompt: string, selectedBlocks: ContextBlock[], originalTokenEstimate: number): string {
    let candidate = prompt;
    const excerpts = selectedBlocks
      .map((block) => block.text.trim().replace(/\s+/g, ' '))
      .filter((text) => text.length > 0)
      .map((text) => text.slice(0, Math.min(text.length, this.maxFactLength * 2)));

    for (const excerpt of excerpts) {
      if (reductionPercentFrom(originalTokenEstimate, estimateTokens(candidate)) <= this.maxReductionPercent) {
        return candidate;
      }
      candidate = `${candidate}\n\nEvidence:\n${excerpt}`;
    }

    return candidate;
  }
}

export function estimateTokens(input: string): number {
  const words = input.match(WORD_PATTERN)?.length ?? 0;
  const punctuation = input.match(/[^\s\w]/g)?.length ?? 0;
  return Math.max(1, Math.ceil(words * 1.25 + punctuation * 0.25));
}

export function semanticFingerprint(input: string): string {
  return keywordTokens(input).slice(0, 64).join(' ');
}

function keywordTokens(input: string): string[] {
  const tokens = input.toLowerCase().match(WORD_PATTERN) ?? [];
  return tokens
    .filter((token) => token.length > 2)
    .filter((token) => !STOPWORDS.has(token))
    .sort();
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = semanticFingerprint(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function reductionPercentFrom(originalTokens: number, compressedTokens: number): number {
  if (originalTokens <= 0) return 0;
  return Number((((originalTokens - compressedTokens) / originalTokens) * 100).toFixed(2));
}

function evaluateQualityGate(original: string, compressed: string, requiredTerms: string[]): QualityGate {
  const originalLower = original.toLowerCase();
  const compressedLower = compressed.toLowerCase();
  const termsInOriginal = requiredTerms.filter((term) => originalLower.includes(term.toLowerCase()));
  const retainedRequiredTerms = termsInOriginal.filter((term) => compressedLower.includes(term.toLowerCase()));
  const missingRequiredTerms = termsInOriginal.filter((term) => !compressedLower.includes(term.toLowerCase()));

  if (missingRequiredTerms.length > 0) {
    return {
      status: 'degraded',
      retainedRequiredTerms,
      missingRequiredTerms,
      reason: 'required terms were removed during compression'
    };
  }

  return {
    status: 'passed',
    retainedRequiredTerms,
    missingRequiredTerms: [],
    reason: 'required terms retained; model-quality evaluation not inferred'
  };
}

function quantizationPowerRank(level: QuantizationLevel): number {
  return level === 'q4' ? 0 : level === 'q8' ? 1 : 2;
}

function quantizationQualityRank(level: QuantizationLevel): number {
  return level === 'fp16' ? 2 : level === 'q8' ? 1 : 0;
}

function parseRuleLine(line: string): { condition: string; action: string; weight: number } | null {
  const ifThen = /^if\s+(.+?)\s+then\s+(.+)$/i.exec(line);
  if (ifThen) {
    return {
      condition: normalizeCondition(ifThen[1]),
      action: normalizeAction(ifThen[2]),
      weight: 100
    };
  }

  const must = /^(.+?)\s+must\s+(.+)$/i.exec(line);
  if (must) {
    return {
      condition: normalizeCondition(must[1]),
      action: normalizeAction(must[2]),
      weight: 90
    };
  }

  return null;
}

function normalizeCondition(condition: string): string {
  const normalized = condition.trim().replace(/\s+/g, '_').toLowerCase();
  if (normalized.includes('==')) return normalized;
  return `${normalized}=='true'`;
}

function normalizeAction(action: string): string {
  return action.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function normalizeWorkflowLine(line: string): string {
  return line.replace(/^[-*\d.\s]+/, '').trim();
}

function extractVariables(input: string): string[] {
  const matches = input.match(/\{\{(\w+)\}\}/g) ?? [];
  return matches.map((match) => match.slice(2, -2));
}

function containsAnyTerm(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}
