import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ExecutionTrace } from './types.js';

export class TraceRecorder {
  private readonly traceDir: string;
  private readonly traceFile: string;

  constructor(traceDir: string = path.join(process.cwd(), 'data', 'traces')) {
    this.traceDir = traceDir;
    // Append-only jsonl
    this.traceFile = path.join(this.traceDir, 'execution-traces.jsonl');
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.traceDir)) {
      fs.mkdirSync(this.traceDir, { recursive: true });
    }
  }

  public recordTrace(trace: ExecutionTrace): void {
    const redactedTrace = this.redactSensitiveData(trace);
    const line = JSON.stringify(redactedTrace) + '\n';
    fs.appendFileSync(this.traceFile, line, 'utf-8');
  }

  private redactSensitiveData(trace: ExecutionTrace): ExecutionTrace {
    // Simple redaction: prevent obvious secret leakage.
    // In reality, this would be a deep clone with regex replacement
    // for keys, tokens, etc. For determinism, we sanitize error messages.
    const redacted = { ...trace };
    
    if (redacted.error) {
      redacted.error = redacted.error.replace(/(sk-[a-zA-Z0-9]{20,})|(Bearer\s+[a-zA-Z0-9\-._~+/]+)/g, '[REDACTED]');
    }

    return redacted;
  }

  public static hashInput(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}
