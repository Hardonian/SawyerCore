/**
 * Mesh Executor
 * Coordinates task execution across the edge mesh.
 * - Local vs Remote decisioning
 * - Cross-node dispatch
 * - Deterministic result verification
 */
import { meshAudit } from './audit.js';
import { globalRegistry } from './node-registry.js';
export class MeshExecutor {
    localEngine;
    taskRouter;
    nodeRegistry;
    constructor(localEngine, taskRouter, nodeRegistry) {
        this.localEngine = localEngine;
        this.taskRouter = taskRouter;
        this.nodeRegistry = nodeRegistry;
    }
    /**
     * Executes a task by either running it locally or routing to a mesh peer.
     */
    async execute(task, tenantId, signals) {
        const targetNode = this.taskRouter.selectNode(task);
        const self = globalRegistry.getSelf();
        if (!targetNode || (self && targetNode.id === self.id)) {
            return this.executeLocally(task, tenantId, signals);
        }
        const selfNode = this.nodeRegistry.getSelf();
        const sourceNodeId = selfNode?.id || 'unknown-local';
        // 1. Audit dispatch start
        meshAudit.log({
            taskId: task.id,
            sourceNodeId,
            targetNodeId: targetNode.id,
            action: 'dispatch',
            status: 'success'
        });
        try {
            const response = await this.dispatchRemote(targetNode.id, task, tenantId, signals);
            meshAudit.log({
                taskId: task.id,
                sourceNodeId,
                targetNodeId: targetNode.id,
                action: 'receive',
                status: 'success'
            });
            return response;
        }
        catch (err) {
            const error = err;
            meshAudit.log({
                taskId: task.id,
                sourceNodeId,
                targetNodeId: targetNode.id,
                action: 'fallback',
                status: 'failure',
                details: error.message
            });
            return this.executeLocally(task, tenantId, signals);
        }
    }
    /**
     * Executes a batch of tasks, potentially distributing them across the mesh.
     */
    async executeBatch(tasks, tenantId, signals) {
        return Promise.all(tasks.map(task => this.execute(task, tenantId, signals)));
    }
    async executeLocally(task, tenantId, signals) {
        const self = globalRegistry.getSelf();
        const receipt = await this.localEngine.execute(task, tenantId, signals);
        if (!receipt.result) {
            throw new Error(`Local execution failed for task ${task.id}: ${receipt.reasons.join(', ')}`);
        }
        return {
            nodeId: self?.id ?? 'local',
            result: receipt.result,
            verified: true,
            provenance: receipt.runId
        };
    }
    async dispatchRemote(nodeId, task, _tenantId, _signals) {
        const node = globalRegistry.getNode(nodeId);
        if (!node) {
            throw new Error(`Target node ${nodeId} not found in registry`);
        }
        // Transport layer stub
        // In a production environment, this would involve:
        // 1. Signing the task request
        // 2. Encrypting sensitive input
        // 3. Sending via gRPC/Signed HTTP
        // 4. Verifying the result signature and provenance
        // For Phase 2, we simulate a successful remote call if the node is healthy
        if (node.status === 'stale') {
            throw new Error(`Target node ${nodeId} is stale`);
        }
        // Mock remote response
        return {
            nodeId,
            result: {
                output: `[REMOTE_RESULT from ${nodeId}] Simulated output`,
                provider: 'mesh-peer',
                model: 'simulated',
                latencyMs: 100,
                costUsd: 0
            },
            verified: true, // Verification logic would go here
            provenance: `rem-${task.id}-${nodeId}`
        };
    }
}
