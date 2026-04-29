/**
 * Replayable execution log — append-only JSONL with full provenance.
 * Every execution is recorded with input/output hashes for integrity verification.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type DegradedStateCode = 'NOMINAL' | 'MODEL_UNAVAILABLE' | 'LOW_MEMORY' | 'PARTIAL_EXECUTION';

export interface ExecutionLogEntry {
  runId: string;
  inputHash: string;
  outputHash: string | null;
  provider: string;
  model: string;
  taskType: string;
  degradedState: DegradedStateCode;
  latencyMs: number;
  costUsd: number;
  success: boolean;
  errorMessage: string | null;
  timestampIso: string;
}

export interface ExecutionLogConfig {
  filePath: string;
  rotateBytes: number;
}

const DEFAULT_LOG_CONFIG: ExecutionLogConfig = {
  filePath: '.sawyer/execution.jsonl',
  rotateBytes: 10 * 1024 * 1024
};

export class ExecutionLog {
  private readonly config: ExecutionLogConfig;
  private readonly entries: ExecutionLogEntry[] = [];

  constructor(config: Partial<ExecutionLogConfig> = {}) {
    this.config = {
      filePath: config.filePath ?? DEFAULT_LOG_CONFIG.filePath,
      rotateBytes: config.rotateBytes ?? DEFAULT_LOG_CONFIG.rotateBytes
    };
    mkdirSync(dirname(this.config.filePath), { recursive: true });
  }

  append(entry: ExecutionLogEntry): void {
    this.entries.push(entry);
    this.persistEntry(entry);
  }

  getEntries(): readonly ExecutionLogEntry[] {
    return this.entries;
  }

  findByRunId(runId: string): ExecutionLogEntry | undefined {
    return this.entries.find((e) => e.runId === runId);
  }

  replay(): ExecutionLogEntry[] {
    if (!existsSync(this.config.filePath)) {
      return [];
    }
    const raw = readFileSync(this.config.filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ExecutionLogEntry);
  }

  private persistEntry(entry: ExecutionLogEntry): void {
    if (existsSync(this.config.filePath) && statSync(this.config.filePath).size >= this.config.rotateBytes) {
      const rotatedPath = `${this.config.filePath}.${Date.now()}.bak`;
      renameSync(this.config.filePath, rotatedPath);
    }
    appendFileSync(this.config.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  }
}
