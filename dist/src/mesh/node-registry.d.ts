import { z } from 'zod';
import { Capability } from '../types/contracts.js';
export declare const NodeSchema: z.ZodObject<{
    id: z.ZodString;
    address: z.ZodString;
    capabilities: z.ZodArray<z.ZodString, "many">;
    publicKey: z.ZodString;
    lastSeen: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<["online", "offline", "degraded"]>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "degraded" | "online" | "offline";
    metadata: Record<string, any>;
    capabilities: string[];
    address: string;
    publicKey: string;
    lastSeen?: number | undefined;
}, {
    id: string;
    status: "degraded" | "online" | "offline";
    capabilities: string[];
    address: string;
    publicKey: string;
    metadata?: Record<string, any> | undefined;
    lastSeen?: number | undefined;
}>;
export type Node = z.infer<typeof NodeSchema>;
export declare class NodeRegistry {
    private nodes;
    register(node: Node): void;
    deregister(nodeId: string): void;
    getNode(nodeId: string): Node | undefined;
    getAllNodes(): Node[];
    getNodesWithCapability(capability: Capability): Node[];
    updateStatus(nodeId: string, status: Node['status']): void;
}
export declare const globalRegistry: NodeRegistry;
