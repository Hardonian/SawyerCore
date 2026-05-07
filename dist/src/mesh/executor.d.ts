/**
 * Mesh Executor
 * Coordinates task execution across the edge mesh.
 * - Local vs Remote decisioning
 * - Cross-node dispatch
 * - Deterministic result verification
 */
import { TaskRouter } from './task-routing.js';
import { NodeRegistry } from './node-registry.js';
import { DeterministicEngine } from '../runtime/core/deterministic-engine.js';
import type { AiTask, InferenceResult } from '../types/contracts.js';
import type { RoutingSignals } from '../runtime/optimization-engine.js';
export interface MeshExecutionResult {
    nodeId: string;
    result: InferenceResult;
    verified: boolean;
    provenance: string;
}
export declare class MeshExecutor {
    private readonly localEngine;
    private readonly taskRouter;
    private readonly nodeRegistry;
    constructor(localEngine: DeterministicEngine, taskRouter: TaskRouter, nodeRegistry: NodeRegistry);
    /**
     * Executes a task by either running it locally or routing to a mesh peer.
     */
    execute(task: AiTask, tenantId: string, signals: RoutingSignals): Promise<MeshExecutionResult>;
    /**
     * Executes a batch of tasks, potentially distributing them across the mesh.
     */
    executeBatch(tasks: AiTask[], tenantId: string, signals: RoutingSignals): Promise<MeshExecutionResult[]>;
    private executeLocally;
    private dispatchRemote;
}
