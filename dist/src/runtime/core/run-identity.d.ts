/**
 * Deterministic run identity via SHA-256 hashing.
 * Produces a reproducible runId from all execution inputs.
 * Same inputs always produce the same runId — no timestamps, no randomness.
 */
export interface RunIdentityInputs {
    taskId: string;
    taskType: string;
    input: string;
    configHash: string;
    providerNames: string[];
}
export interface RunIdentity {
    runId: string;
    inputHash: string;
}
export declare function computeInputHash(input: string): string;
export declare function computeRunId(inputs: RunIdentityInputs): RunIdentity;
export declare function computeOutputHash(output: string): string;
export declare function computeConfigHash(config: unknown): string;
