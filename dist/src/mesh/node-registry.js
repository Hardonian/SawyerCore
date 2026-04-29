import { z } from 'zod';
export const NodeSchema = z.object({
    id: z.string().uuid(),
    address: z.string().url(),
    capabilities: z.array(z.string()), // Capabilities from contracts.ts
    publicKey: z.string(),
    lastSeen: z.number().optional(),
    status: z.enum(['online', 'offline', 'degraded']),
    metadata: z.record(z.any()).default({}),
});
export class NodeRegistry {
    nodes = new Map();
    register(node) {
        // Validate signature would happen here in a real scenario
        this.nodes.set(node.id, {
            ...node,
            lastSeen: Date.now(), // Determinism note: in production this should be passed or synced
        });
    }
    deregister(nodeId) {
        this.nodes.delete(nodeId);
    }
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    getNodesWithCapability(capability) {
        return this.getAllNodes().filter(n => n.capabilities.includes(capability));
    }
    updateStatus(nodeId, status) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.status = status;
            node.lastSeen = Date.now();
        }
    }
}
export const globalRegistry = new NodeRegistry();
