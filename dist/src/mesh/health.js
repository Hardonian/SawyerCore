import { globalRegistry } from './node-registry.js';
export class HealthMonitor {
    static MAX_SILENCE_MS = 30000; // 30 seconds
    static async processHeartbeat(report) {
        const node = globalRegistry.getNode(report.nodeId);
        if (!node)
            return false;
        // Verify signature logic would go here
        const isValid = this.verifySignature(report, node.publicKey);
        if (!isValid) {
            console.error(`Invalid health report signature from node ${report.nodeId}`);
            globalRegistry.updateStatus(report.nodeId, 'offline');
            return false;
        }
        globalRegistry.updateStatus(report.nodeId, 'online');
        // Update metadata with usage stats
        node.metadata = {
            ...node.metadata,
            cpu: report.cpuUsage,
            memory: report.memoryUsage,
            activeTasks: report.activeTasks,
        };
        return true;
    }
    static checkStaleNodes() {
        const now = Date.now();
        const nodes = globalRegistry.getAllNodes();
        for (const node of nodes) {
            if (node.lastSeen && (now - node.lastSeen > this.MAX_SILENCE_MS)) {
                globalRegistry.updateStatus(node.id, 'offline');
            }
        }
    }
    static verifySignature(report, _publicKey) {
        // Placeholder for cryptographic verification
        // In Zeo, everything must be signed.
        return report.signature.length > 0;
    }
}
