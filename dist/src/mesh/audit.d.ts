/**
 * MESH AUDIT LOGGING
 * Provides cross-node traceability for task distribution and execution.
 * Ensures every mesh action is auditable and explainable.
 */
export type MeshAction = 'dispatch' | 'receive' | 'fallback' | 'verify' | 'consensus';
export type MeshStatus = 'success' | 'failure' | 'denied' | 'stale' | 'retry';
export interface MeshAuditEvent {
    id: string;
    taskId: string;
    timestamp: number;
    sourceNodeId: string;
    targetNodeId: string;
    action: MeshAction;
    status: MeshStatus;
    details?: string;
    signature?: string;
    provenanceHash?: string;
}
export declare class MeshAuditLogger {
    private static instance;
    private events;
    private constructor();
    static getInstance(): MeshAuditLogger;
    log(event: Omit<MeshAuditEvent, 'id' | 'timestamp'>): MeshAuditEvent;
    getHistory(taskId?: string): MeshAuditEvent[];
    clear(): void;
}
export declare const meshAudit: MeshAuditLogger;
