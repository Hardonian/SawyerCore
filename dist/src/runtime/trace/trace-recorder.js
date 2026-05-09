import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
export class TraceRecorder {
    traceDir;
    traceFile;
    constructor(traceDir = path.join(process.cwd(), 'data', 'traces')) {
        this.traceDir = traceDir;
        // Append-only jsonl
        this.traceFile = path.join(this.traceDir, 'execution-traces.jsonl');
        this.ensureDir();
    }
    ensureDir() {
        if (!fs.existsSync(this.traceDir)) {
            fs.mkdirSync(this.traceDir, { recursive: true });
        }
    }
    recordTrace(trace) {
        const redactedTrace = this.redactSensitiveData(trace);
        const line = JSON.stringify(redactedTrace) + '\n';
        fs.appendFileSync(this.traceFile, line, 'utf-8');
    }
    redactSensitiveData(trace) {
        // Simple redaction: prevent obvious secret leakage.
        // In reality, this would be a deep clone with regex replacement
        // for keys, tokens, etc. For determinism, we sanitize error messages.
        const redacted = { ...trace };
        if (redacted.error) {
            redacted.error = redacted.error.replace(/(sk-[a-zA-Z0-9]{20,})|(Bearer\s+[a-zA-Z0-9\-._~+/]+)/g, '[REDACTED]');
        }
        return redacted;
    }
    static hashInput(input) {
        return crypto.createHash('sha256').update(input).digest('hex');
    }
}
