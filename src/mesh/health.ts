import { globalRegistry } from './node-registry.js';

export interface HealthReport {
  nodeId: string;
  cpuUsage: number;
  memoryUsage: number;
  activeTasks: number;
  timestamp: number;
  signature: string;
}

export class HealthMonitor {
  private static MAX_SILENCE_MS = 30000; // 30 seconds

  static async processHeartbeat(report: HealthReport): Promise<boolean> {
    const node = globalRegistry.getNode(report.nodeId);
    if (!node) return false;

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

  static checkStaleNodes(): void {
    const now = Date.now();
    const nodes = globalRegistry.getAllNodes();
    for (const node of nodes) {
      if (node.lastSeen && (now - node.lastSeen > this.MAX_SILENCE_MS)) {
        globalRegistry.updateStatus(node.id, 'offline');
      }
    }
  }

  private static verifySignature(report: HealthReport, _publicKey: string): boolean {
    // Placeholder for cryptographic verification
    // In Zeo, everything must be signed.
    return report.signature.length > 0; 
  }
}
