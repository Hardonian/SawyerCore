/**
 * Intent resolver — translates user intent strings into concrete AiTask objects.
 * The system user provides intent (e.g. "summarize this document"),
 * the resolver maps it to a fully specified AiTask ready for execution.
 *
 * Uses a deterministic mapping from intent keywords to task types.
 * No LLM call needed — rule-based resolution for reliability.
 */
import type { AiTask, TaskType, Capability, DataClassification, PrivacyRequirement } from '../../types/contracts.js';
export interface IntentDefaults {
    dataClassification: DataClassification;
    privacyRequirement: PrivacyRequirement;
    maxBudgetUsd: number;
    fallbackAllowed: boolean;
    maxContextTokens: number;
    latencyPreferenceMs: number;
}
interface IntentMapping {
    keywords: string[];
    taskType: TaskType;
    capability: Capability;
}
export declare class IntentResolver {
    private readonly defaults;
    private sequenceCounter;
    constructor(defaults?: Partial<IntentDefaults>);
    resolve(intent: string, overrides?: Partial<IntentDefaults>): AiTask;
    matchIntent(normalizedIntent: string): IntentMapping;
}
export {};
