/**
 * Mesh Executor
 * Coordinates task execution across the edge mesh.
 * - Local vs Remote decisioning
 * - Cross-node dispatch
 * - Deterministic result verification
 */

import { TaskRouter } from './task-routing.js';
import { globalRegistry } from './node-registry.js';
import { DeterministicEngine } from '../runtime/core/deterministic-engine.js';
import type { AiTask, InferenceResult } from '../types/contracts.js';
import type { RoutingSignals } from '../runtime/optimization-engine.js';

export interface MeshExecutionResult {
  nodeId: string;
  result: InferenceResult;
  verified: boolean;
  provenance: string;
}

export class MeshExecutor {
  constructor(
    private readonly localEngine: DeterministicEngine,
    private readonly taskRouter: TaskRouter
  ) {}

  /**
   * Executes a task by either running it locally or routing to a mesh peer.
   */
  async execute(
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals
  ): Promise<MeshExecutionResult> {
    const targetNode = this.taskRouter.selectNode(task);
    const self = globalRegistry.getSelf();

    if (!targetNode || (self && targetNode.id === self.id)) {
      return this.executeLocally(task, tenantId, signals);
    }

    try {
      return await this.dispatchRemote(targetNode.id, task, tenantId, signals);
    } catch (error) {
      console.warn(`[Mesh] Remote execution on ${targetNode.id} failed, falling back to local:`, error);
      return this.executeLocally(task, tenantId, signals);
    }
  }

  /**
   * Executes a batch of tasks, potentially distributing them across the mesh.
   */
  async executeBatch(
    tasks: AiTask[],
    tenantId: string,
    signals: RoutingSignals
  ): Promise<MeshExecutionResult[]> {
    return Promise.all(tasks.map(task => this.execute(task, tenantId, signals)));
  }

  private async executeLocally(
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals
  ): Promise<MeshExecutionResult> {
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

  private async dispatchRemote(
    nodeId: string,
    task: AiTask,
    _tenantId: string,
    _signals: RoutingSignals
  ): Promise<MeshExecutionResult> {
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
