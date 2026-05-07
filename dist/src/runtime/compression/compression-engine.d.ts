import { type RuleGraphData, type RuleNode } from '../memory/rule-graph.js';
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
    steps: Array<{
        id: string;
        command: string;
    }>;
}
export interface CompressionEngineOptions {
    maxContextBlocks?: number;
    maxFactLength?: number;
    maxReductionPercent?: number;
}
export declare class CompressionEngine {
    private readonly maxContextBlocks;
    private readonly maxFactLength;
    private readonly maxReductionPercent;
    constructor(options?: CompressionEngineOptions);
    compressPrompt(input: CompressionInput): CompressionResult;
    selectModel(candidates: OptimizationModelCandidate[], constraints: ModelSelectionConstraints): ModelSelectionResult;
    docsToRuleGraph(documentText: string): RuleGraphData;
    evaluateDocumentRules(documentText: string, context: Record<string, string>): RuleNode[];
    workflowToTemplate(id: string, workflowText: string): WorkflowTemplate;
    private selectBlocks;
    private extractFacts;
    private applyBudget;
    private retainEvidenceBand;
}
export declare function estimateTokens(input: string): number;
export declare function semanticFingerprint(input: string): string;
