import { type PromptVariable } from '../memory/prompt-memory.js';
export interface PromptFragment {
    id: string;
    template: string;
    variables?: PromptVariable[];
    dependsOn?: string[];
    priority?: number;
}
export interface PromptBuildInput {
    rootFragmentId: string;
    fragments: PromptFragment[];
    variables?: PromptVariable[];
    tokenBudget?: number;
}
export interface PromptBuildResult {
    prompt: string;
    tokenEstimate: number;
    fragmentOrder: string[];
    unresolvedVariables: string[];
    warnings: string[];
}
export declare class RecursivePromptSystem {
    build(input: PromptBuildInput): PromptBuildResult;
    private resolveFragmentOrder;
}
