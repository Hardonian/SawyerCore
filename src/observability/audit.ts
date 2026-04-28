import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuditEvent {
  requestId: string;
  taskId: string;
  requestedTask: string;
  selectedProvider: string | 'DENY';
  deniedProviders: Array<{ provider: string; reason: string }>;
  costEstimateUsd?: number;
  latencyEstimateMs?: number;
  policyDecision: 'allow' | 'deny';
  scoringBreakdown?: Record<string, number>;
  fallbackPath: string[];
  degradedState?: string;
  status: 'success' | 'denied' | 'failed';
  timestamp: string;
}

export interface AuditLoggerOptions {
  filePath?: string;
  rotateBytes?: number;
}

interface AuditSink {
  write(event: AuditEvent): void;
  read(): AuditEvent[];
}

export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];
  private readonly filePath?: string;
  private readonly rotateBytes: number;

  constructor(options: AuditLoggerOptions = {}) {
    this.filePath = options.filePath;
    this.rotateBytes = options.rotateBytes ?? 5 * 1024 * 1024;
    if (this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true });
    }
  }

  log(event: Omit<AuditEvent, 'timestamp'>): void {
    const withTimestamp: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    this.events.push(withTimestamp);
    if (!this.filePath) return;

    if (existsSync(this.filePath) && statSync(this.filePath).size >= this.rotateBytes) {
      renameSync(this.filePath, `${this.filePath}.${Date.now()}.bak`);
    }
    appendFileSync(this.filePath, `${JSON.stringify(withTimestamp)}\n`, { encoding: 'utf8' });
  }

  read(): AuditEvent[] {
    return [...this.events];
  }
}

export class JsonlAuditSink implements AuditSink {
  constructor(private readonly path = '.sawyer-audit.jsonl') {}

  write(event: AuditEvent): void {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, 'utf8');
  }

  read(): AuditEvent[] {
    return [];
  }
}

function sanitize(event: AuditEvent): AuditEvent {
  return {
    ...event,
    deniedProviders: event.deniedProviders.map((item) => ({
      provider: item.provider,
      reason: item.reason.replace(/(api[_-]?key|token|secret)=\S+/gi, '$1=[redacted]')
    }))
  };
}

export class AuditLogger {
  constructor(private readonly sink: AuditSink = new InMemoryAuditSink()) {}

  log(event: AuditEvent): void {
    this.sink.write(sanitize(event));
  }

  list(): AuditEvent[] {
    return this.sink.read();
  }
}
