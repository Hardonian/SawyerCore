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

export class MeshAuditLogger {
  private static instance: MeshAuditLogger;
  private events: MeshAuditEvent[] = [];

  private constructor() {}

  static getInstance(): MeshAuditLogger {
    if (!MeshAuditLogger.instance) {
      MeshAuditLogger.instance = new MeshAuditLogger();
    }
    return MeshAuditLogger.instance;
  }

  log(event: Omit<MeshAuditEvent, 'id' | 'timestamp'>): MeshAuditEvent {
    const fullEvent: MeshAuditEvent = {
      ...event,
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      timestamp: Date.now()
    };
    
    this.events.push(fullEvent);
    
    // For Antigravity: Log must be explicit and deterministic
    const logMsg = `[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`;
    if (fullEvent.status === 'failure' || fullEvent.status === 'denied') {
      console.error(logMsg, fullEvent.details || '');
    } else {
      console.log(logMsg);
    }
    
    return fullEvent;
  }

  getHistory(taskId?: string): MeshAuditEvent[] {
    if (taskId) {
      return this.events.filter(e => e.taskId === taskId);
    }
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export const meshAudit = MeshAuditLogger.getInstance();
