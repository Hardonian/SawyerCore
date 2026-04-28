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

export class AuditLogger {
  private readonly events: AuditEvent[] = [];

  log(event: AuditEvent): void {
    this.events.push(event);
  }

  list(): AuditEvent[] {
    return [...this.events];
  }
}
