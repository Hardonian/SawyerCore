import type { DeviceInventory } from './onboarding.js';
export interface RecommendationOutput {
    profile: string;
    providerPriority: string[];
    modelsByTask: Record<string, string[]>;
    quantization: 'q4' | 'q6' | 'fp16';
    preloadPlan: string[];
    privacyPolicy: string;
    costControls: string[];
    explanation: string;
    confidence: number;
    warnings: string[];
}
export declare function generateDeterministicRecommendation(inventory: DeviceInventory): RecommendationOutput;
export declare function maybeGenerateAiExplanation(base: RecommendationOutput, enabled: boolean): RecommendationOutput;
