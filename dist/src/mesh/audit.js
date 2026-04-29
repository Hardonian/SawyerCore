/**
 * MESH AUDIT LOGGING
 * Provides cross-node traceability for task distribution and execution.
 * Ensures every mesh action is auditable and explainable.
 */
export class MeshAuditLogger {
    static instance;
    eventCounter = 0;
    clock = () => Date.now();
    events = [];
    constructor() { }
    static getInstance() {
        if (!MeshAuditLogger.instance) {
            MeshAuditLogger.instance = new MeshAuditLogger();
        }
        return MeshAuditLogger.instance;
    }
    setClock(clock) {
        this.clock = clock;
    }
    log(event) {
        const fullEvent = {
            ...event,
            id: `mesh-${++this.eventCounter}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: this.clock()
        };
        this.events.push(fullEvent);
        // Performance: Only format string if needed or use a lighter format
        if (fullEvent.status === 'failure' || fullEvent.status === 'denied') {
            console.error(`[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`, fullEvent.details || '');
        }
        else {
            // In high-performance mode, we might want to skip this or use a logger
            console.log(`[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`);
        }
        return fullEvent;
    }
    getHistory(taskId) {
        if (taskId) {
            return this.events.filter(e => e.taskId === taskId);
        }
        return [...this.events];
    }
    clear() {
        this.events = [];
    }
}
export const meshAudit = MeshAuditLogger.getInstance();
