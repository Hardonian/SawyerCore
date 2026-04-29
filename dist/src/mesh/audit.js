/**
 * MESH AUDIT LOGGING
 * Provides cross-node traceability for task distribution and execution.
 * Ensures every mesh action is auditable and explainable.
 */
export class MeshAuditLogger {
    static instance;
    events = [];
    constructor() { }
    static getInstance() {
        if (!MeshAuditLogger.instance) {
            MeshAuditLogger.instance = new MeshAuditLogger();
        }
        return MeshAuditLogger.instance;
    }
    log(event) {
        const fullEvent = {
            ...event,
            id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            timestamp: Date.now()
        };
        this.events.push(fullEvent);
        // For Antigravity: Log must be explicit and deterministic
        const logMsg = `[MeshAudit] [${fullEvent.action.toUpperCase()}] Task:${fullEvent.taskId} From:${fullEvent.sourceNodeId} To:${fullEvent.targetNodeId} Status:${fullEvent.status}`;
        if (fullEvent.status === 'failure' || fullEvent.status === 'denied') {
            console.error(logMsg, fullEvent.details || '');
        }
        else {
            console.log(logMsg);
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
