/**
 * Intent resolver — translates user intent strings into concrete AiTask objects.
 * The system user provides intent (e.g. "summarize this document"),
 * the resolver maps it to a fully specified AiTask ready for execution.
 *
 * Uses a deterministic mapping from intent keywords to task types.
 * No LLM call needed — rule-based resolution for reliability.
 */
import { createHash } from 'node:crypto';
const DEFAULT_INTENT = {
    dataClassification: 'internal',
    privacyRequirement: 'local-preferred',
    maxBudgetUsd: 0.02,
    fallbackAllowed: false,
    maxContextTokens: 4096,
    latencyPreferenceMs: 2000
};
const INTENT_MAPPINGS = [
    { keywords: ['summarize', 'summary', 'tldr', 'brief'], taskType: 'summarization', capability: 'summarization' },
    { keywords: ['code', 'program', 'function', 'debug', 'refactor'], taskType: 'code-reasoning', capability: 'code' },
    { keywords: ['classify', 'categorize', 'label', 'detect'], taskType: 'classification', capability: 'classification' },
    { keywords: ['embed', 'embedding', 'vector', 'encode'], taskType: 'embedding', capability: 'embedding' },
    { keywords: ['plan', 'orchestrate', 'workflow', 'agent', 'automate'], taskType: 'agent-planning', capability: 'planning' },
    { keywords: ['chat', 'ask', 'question', 'help', 'explain'], taskType: 'chat', capability: 'chat' }
];
export class IntentResolver {
    defaults;
    sequenceCounter = 0;
    constructor(defaults = {}) {
        this.defaults = { ...DEFAULT_INTENT, ...defaults };
    }
    resolve(intent, overrides = {}) {
        const normalized = intent.toLowerCase().trim();
        const mapping = this.matchIntent(normalized);
        const merged = { ...this.defaults, ...overrides };
        const sequence = this.sequenceCounter++;
        const taskId = createHash('sha256')
            .update(`${normalized}:${sequence}`)
            .digest('hex')
            .slice(0, 16);
        return {
            id: taskId,
            type: mapping.taskType,
            input: intent,
            inputClassification: merged.dataClassification,
            requiredCapability: mapping.capability,
            latencyPreferenceMs: merged.latencyPreferenceMs,
            privacyRequirement: merged.privacyRequirement,
            maxBudgetUsd: merged.maxBudgetUsd,
            fallbackAllowed: merged.fallbackAllowed,
            maxContextTokens: merged.maxContextTokens
        };
    }
    matchIntent(normalizedIntent) {
        for (const mapping of INTENT_MAPPINGS) {
            for (const keyword of mapping.keywords) {
                if (normalizedIntent.includes(keyword)) {
                    return mapping;
                }
            }
        }
        return { keywords: ['chat'], taskType: 'chat', capability: 'chat' };
    }
}
