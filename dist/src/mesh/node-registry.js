import { z } from 'zod';
export const NodeStatusSchema = z.enum(['online', 'offline', 'degraded', 'stale', 'failed', 'active']);
export const NodeSchema = z.object({
    id: z.string(),
    address: z.string().url(),
    capabilities: z.array(z.string()), // Capabilities from contracts.ts
    publicKey: z.string(),
    lastSeen: z.number().optional(),
    status: NodeStatusSchema,
    metadata: z.record(z.any()).default({}),
});
export class NodeRegistry {
    nodes = new Map();
    selfId = null;
    setSelf(nodeId) {
        this.selfId = nodeId;
    }
    getSelf() {
        return this.selfId ? this.nodes.get(this.selfId) : undefined;
    }
    register(node) {
        this.nodes.set(node.id, {
            ...node,
            lastSeen: Date.now(),
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
        const results = [];
        for (const n of this.nodes.values()) {
            if (n.capabilities.includes(capability)) {
                results.push(n);
            }
        }
        return results;
    }
    updateStatus(nodeId, status) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.status = status;
            node.lastSeen = Date.now();
        }
    }
    clear() {
        this.nodes.clear();
        this.selfId = null;
    }
}
export const globalRegistry = new NodeRegistry();
