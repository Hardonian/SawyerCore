/**
 * Recursive prompt memory variables.
 * Variable substitution in prompts with cycle detection.
 * Immutable snapshots for deterministic prompt construction.
 */
export interface PromptVariable {
    name: string;
    value: string;
}
export declare class PromptMemory {
    private readonly variables;
    private static readonly MAX_RECURSION;
    private static readonly VAR_PATTERN;
    constructor(initial?: PromptVariable[]);
    set(name: string, value: string): void;
    get(name: string): string | undefined;
    delete(name: string): boolean;
    resolve(template: string): string;
    private resolveRecursive;
    snapshot(): ReadonlyMap<string, string>;
    toArray(): PromptVariable[];
    size(): number;
}
