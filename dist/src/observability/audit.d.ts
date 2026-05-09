export interface AuditEvent {
    requestId?: string;
    taskId?: string;
    requestedTask?: string;
    selectedProvider?: string | 'DENY';
    deniedProviders?: Array<{
        provider: string;
        reason: string;
    }>;
    costEstimateUsd?: number;
    latencyEstimateMs?: number;
    policyDecision?: 'allow' | 'deny';
    scoringBreakdown?: Record<string, number>;
    fallbackPath?: string[];
    degradedState?: string;
    status?: 'success' | 'denied' | 'failed' | 'system_event';
    systemEvent?: unknown;
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
export declare class InMemoryAuditSink implements AuditSink {
    private readonly events;
    private readonly filePath?;
    private readonly rotateBytes;
    constructor(options?: AuditLoggerOptions);
    write(event: AuditEvent): void;
    log(event: Omit<AuditEvent, 'timestamp'>): void;
    read(): AuditEvent[];
}
export declare class JsonlAuditSink implements AuditSink {
    private readonly path;
    constructor(path?: string);
    write(event: AuditEvent): void;
    read(): AuditEvent[];
}
export declare class AuditLogger {
    private readonly sink;
    constructor(sink?: AuditSink);
    log(event: Omit<AuditEvent, 'timestamp'>): void;
    list(): AuditEvent[];
}
export {};
