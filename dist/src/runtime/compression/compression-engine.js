import { RuleGraph } from '../memory/rule-graph.js';
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
    maxContextBlocks;
    maxFactLength;
    maxReductionPercent;
    constructor(options = {}) {
        this.maxContextBlocks = options.maxContextBlocks ?? DEFAULT_MAX_CONTEXT_BLOCKS;
        this.maxFactLength = options.maxFactLength ?? DEFAULT_MAX_FACT_LENGTH;
        this.maxReductionPercent = options.maxReductionPercent ?? DEFAULT_MAX_REDUCTION_PERCENT;
    }
    compressPrompt(input) {
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
    selectModel(candidates, constraints) {
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
    docsToRuleGraph(documentText) {
        const lines = documentText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const nodes = [];
        for (const [index, line] of lines.entries()) {
            const normalized = line.replace(/^[-*#\d.\s]+/, '').trim();
            const rule = parseRuleLine(normalized);
            if (!rule)
                continue;
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
    evaluateDocumentRules(documentText, context) {
        return new RuleGraph(this.docsToRuleGraph(documentText)).evaluate(context);
    }
    workflowToTemplate(id, workflowText) {
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
    selectBlocks(blocks, requiredTerms) {
        const seenFingerprints = new Set();
        const selected = [];
        const sorted = [...blocks].sort((a, b) => {
            const requiredScoreA = containsAnyTerm(a.text, requiredTerms) ? 1 : 0;
            const requiredScoreB = containsAnyTerm(b.text, requiredTerms) ? 1 : 0;
            return (requiredScoreB - requiredScoreA ||
                (b.weight ?? 0) - (a.weight ?? 0) ||
                a.id.localeCompare(b.id));
        });
        for (const block of sorted) {
            const fingerprint = semanticFingerprint(block.text);
            if (seenFingerprints.has(fingerprint))
                continue;
            seenFingerprints.add(fingerprint);
            selected.push(block);
            if (selected.length >= this.maxContextBlocks)
                break;
        }
        return selected;
    }
    extractFacts(text) {
        return text
            .split(/(?<=[.!?])\s+|\r?\n/)
            .map((sentence) => sentence.trim().replace(/\s+/g, ' '))
            .filter((sentence) => sentence.length > 0)
            .map((sentence) => sentence.length > this.maxFactLength
            ? `${sentence.slice(0, this.maxFactLength - 1).trim()}`
            : sentence)
            .filter((sentence) => keywordTokens(sentence).length >= 2);
    }
    applyBudget(prompt, tokenBudget) {
        if (!tokenBudget)
            return prompt;
        const currentEstimate = estimateTokens(prompt);
        if (currentEstimate <= tokenBudget)
            return prompt;
        const lines = prompt.split('\n');
        const retained = [];
        let runningEstimate = 0;
        const separatorEstimate = estimateTokens('\n');
        for (const line of lines) {
            const lineEstimate = estimateTokens(line);
            const totalIfAdded = runningEstimate + (retained.length > 0 ? separatorEstimate : 0) + lineEstimate;
            if (totalIfAdded > tokenBudget)
                break;
            retained.push(line);
            runningEstimate = totalIfAdded;
        }
        return retained.join('\n').trim();
    }
    retainEvidenceBand(prompt, selectedBlocks, originalTokenEstimate) {
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
const TOKEN_CACHE = new Map();
const MAX_CACHE_SIZE = 1000;
export function estimateTokens(input) {
    if (input.length === 0)
        return 0;
    if (input.length < 512) {
        const cached = TOKEN_CACHE.get(input);
        if (cached !== undefined)
            return cached;
    }
    const words = input.match(WORD_PATTERN)?.length ?? 0;
    const punctuation = input.match(/[^\s\w]/g)?.length ?? 0;
    const estimate = Math.max(1, Math.ceil(words * 1.25 + punctuation * 0.25));
    if (input.length < 512) {
        if (TOKEN_CACHE.size >= MAX_CACHE_SIZE) {
            const firstKey = TOKEN_CACHE.keys().next().value;
            if (firstKey !== undefined)
                TOKEN_CACHE.delete(firstKey);
        }
        TOKEN_CACHE.set(input, estimate);
    }
    return estimate;
}
export function semanticFingerprint(input) {
    return keywordTokens(input).slice(0, 64).join(' ');
}
function keywordTokens(input) {
    const tokens = input.toLowerCase().match(WORD_PATTERN) ?? [];
    return tokens
        .filter((token) => token.length > 2)
        .filter((token) => !STOPWORDS.has(token))
        .sort();
}
function dedupeStable(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const key = semanticFingerprint(value);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}
function reductionPercentFrom(originalTokens, compressedTokens) {
    if (originalTokens <= 0)
        return 0;
    return Number((((originalTokens - compressedTokens) / originalTokens) * 100).toFixed(2));
}
function evaluateQualityGate(original, compressed, requiredTerms) {
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
function quantizationPowerRank(level) {
    return level === 'q4' ? 0 : level === 'q8' ? 1 : 2;
}
function quantizationQualityRank(level) {
    return level === 'fp16' ? 2 : level === 'q8' ? 1 : 0;
}
function parseRuleLine(line) {
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
function normalizeCondition(condition) {
    const normalized = condition.trim().replace(/\s+/g, '_').toLowerCase();
    if (normalized.includes('=='))
        return normalized;
    return `${normalized}=='true'`;
}
function normalizeAction(action) {
    return action.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}
function normalizeWorkflowLine(line) {
    return line.replace(/^[-*\d.\s]+/, '').trim();
}
function extractVariables(input) {
    const matches = input.match(/\{\{(\w+)\}\}/g) ?? [];
    return matches.map((match) => match.slice(2, -2));
}
function containsAnyTerm(input, terms) {
    const lower = input.toLowerCase();
    return terms.some((term) => lower.includes(term.toLowerCase()));
}
