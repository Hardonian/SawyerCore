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
  private eventCounter = 0;
  private clock: () => number = () => Date.now();
  private events: MeshAuditEvent[] = [];

  private constructor() {}

  static getInstance(): MeshAuditLogger {
    if (!MeshAuditLogger.instance) {
      MeshAuditLogger.instance = new MeshAuditLogger();
    }
    return MeshAuditLogger.instance;
  }

  setClock(clock: () => number): void {
    this.clock = clock;
  }

  log(event: Omit<MeshAuditEvent, 'id' | 'timestamp'>): MeshAuditEvent {
    const fullEvent: MeshAuditEvent = {
      ...event,
      id: `mesh-${++this.eventCounter}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: this.clock()
    };
    
    this.events.push(fullEvent);
    
    // Performance: Only format string if needed or use a lighter format
    if (fullEvent.status === 'failure' || fullEvent.status === 'denied') {
      console.error(`[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`, fullEvent.details || '');
    } else {
      // In high-performance mode, we might want to skip this or use a logger
      console.log(`[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`);
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
