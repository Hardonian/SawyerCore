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
  private currentSizeBytes = 0;

  constructor(config: Partial<ExecutionLogConfig> = {}) {
    this.config = {
      filePath: config.filePath ?? DEFAULT_LOG_CONFIG.filePath,
      rotateBytes: config.rotateBytes ?? DEFAULT_LOG_CONFIG.rotateBytes
    };
    mkdirSync(dirname(this.config.filePath), { recursive: true });
    
    // Initialize size tracker
    if (existsSync(this.config.filePath)) {
      this.currentSizeBytes = statSync(this.config.filePath).size;
    }
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

  getLatest(): ExecutionLogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  replay(): ExecutionLogEntry[] {
    if (!existsSync(this.config.filePath)) {
      return [];
    }
    const raw = readFileSync(this.config.filePath, 'utf8');
    const loaded = raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ExecutionLogEntry);
    
    this.entries.push(...loaded);
    return loaded;
  }

  private persistEntry(entry: ExecutionLogEntry): void {
    const data = `${JSON.stringify(entry)}\n`;
    const dataSize = Buffer.byteLength(data, 'utf8');

    if (this.currentSizeBytes + dataSize >= this.config.rotateBytes) {
      const rotatedPath = `${this.config.filePath}.${Date.now()}.bak`;
      try {
        renameSync(this.config.filePath, rotatedPath);
        this.currentSizeBytes = 0;
      } catch {
        // Fallback or ignore if rename fails
      }
    }
    
    appendFileSync(this.config.filePath, data, { encoding: 'utf8' });
    this.currentSizeBytes += dataSize;
  }
}
