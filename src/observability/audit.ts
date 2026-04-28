import { appendFileSync } from 'node:fs';

export interface AuditEvent {
  taskId: string;
  requestedTask: string;
  selectedProvider: string | 'DENY';
  deniedProviders: Array<{ provider: string; reason: string }>;
  costEstimateUsd?: number;
  latencyEstimateMs?: number;
  policyDecision: 'allow' | 'deny';
  fallbackPath: string[];
  degradedState?: string;
  status: 'success' | 'denied' | 'failed';
}

interface AuditSink {
  write(event: AuditEvent): void;
  read(): AuditEvent[];
}

export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];

  write(event: AuditEvent): void {
    this.events.push(event);
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
