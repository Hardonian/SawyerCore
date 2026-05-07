import { z } from 'zod';
import { Capability } from '../types/contracts.js';

export const NodeStatusSchema = z.enum(['online', 'offline', 'degraded', 'stale', 'failed', 'active']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const NodeSchema = z.object({
  id: z.string(),
  address: z.string().url(),
  capabilities: z.array(z.string()), // Capabilities from contracts.ts
  publicKey: z.string(),
  lastSeen: z.number().optional(),
  status: NodeStatusSchema,
  metadata: z.record(z.any()).default({}),
});

export type Node = z.infer<typeof NodeSchema>;

export class NodeRegistry {
  private nodes: Map<string, Node> = new Map();
  private selfId: string | null = null;

  setSelf(nodeId: string): void {
    this.selfId = nodeId;
  }

  getSelf(): Node | undefined {
    return this.selfId ? this.nodes.get(this.selfId) : undefined;
  }

  register(node: Node): void {
    this.nodes.set(node.id, {
      ...node,
      lastSeen: Date.now(),
    });
  }

  deregister(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  getNode(nodeId: string): Node | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  getNodesWithCapability(capability: Capability): Node[] {
    const results: Node[] = [];
    for (const n of this.nodes.values()) {
      if (n.capabilities.includes(capability)) {
        results.push(n);
      }
    }
    return results;
  }

  updateStatus(nodeId: string, status: NodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
      node.lastSeen = Date.now();
    }
  }

  clear(): void {
    this.nodes.clear();
    this.selfId = null;
  }
}

export const globalRegistry = new NodeRegistry();
