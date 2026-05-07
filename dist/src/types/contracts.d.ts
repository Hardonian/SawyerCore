export type TaskType = 'chat' | 'summarization' | 'code-reasoning' | 'embedding' | 'classification' | 'vision-placeholder' | 'retrieval-reranking-placeholder' | 'agent-planning';
export type DataClassification = 'public' | 'internal' | 'private' | 'sensitive';
export type PrivacyRequirement = 'local-only' | 'local-preferred' | 'cloud-allowed';
export type Capability = 'chat' | 'summarization' | 'code' | 'embedding' | 'classification' | 'vision' | 'retrieval' | 'planning';
export interface AiTask {
    id: string;
    type: TaskType;
    input: string;
    inputClassification: DataClassification;
    requiredCapability: Capability;
    latencyPreferenceMs: number;
    privacyRequirement: PrivacyRequirement;
    maxBudgetUsd: number;
    fallbackAllowed: boolean;
    maxContextTokens: number;
}
export interface InferenceResult {
    output: string;
    provider: string;
    model: string;
    latencyMs: number;
    costUsd: number;
}
