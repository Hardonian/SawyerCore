/**
 * Deterministic run identity via SHA-256 hashing.
 * Produces a reproducible runId from all execution inputs.
 * Same inputs always produce the same runId — no timestamps, no randomness.
 */

import { createHash } from 'node:crypto';

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

export function computeInputHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeRunId(inputs: RunIdentityInputs): RunIdentity {
  const inputHash = computeInputHash(inputs.input);
  const canonical = JSON.stringify({
    taskId: inputs.taskId,
    taskType: inputs.taskType,
    inputHash,
    configHash: inputs.configHash,
    providers: [...inputs.providerNames].sort()
  });
  const runId = createHash('sha256').update(canonical).digest('hex');
  return { runId, inputHash };
}

export function computeOutputHash(output: string): string {
  return createHash('sha256').update(output).digest('hex');
}

export function computeConfigHash(config: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(config, Object.keys(config as Record<string, unknown>).sort()))
    .digest('hex');
}
