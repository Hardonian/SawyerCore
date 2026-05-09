/**
 * Deterministic execution engine.
 * Wraps the router with full provenance tracking:
 * - Hash-based run identity (input → output integrity)
 * - Replayable execution logs
 * - Explicit degraded state reporting
 */

import type { AiTask, InferenceResult } from '../../types/contracts.js';
import type { SawyerConfig } from '../../types/config.js';
import type { RoutingSignals } from '../optimization-engine.js';
import { SawyerRouter } from '../router.js';
import { computeRunId, computeOutputHash, computeConfigHash, computeInputHash } from './run-identity.js';
import { ExecutionLog, type DegradedStateCode, type ExecutionLogEntry } from './execution-log.js';
import type { AuditLogger } from '../../observability/audit.js';
import type { RuntimeProvider } from '../../providers/provider.js';

export interface ExecutionReceipt {
  runId: string;
  inputHash: string;
  outputHash: string | null;
  decision: string;
  result: InferenceResult | undefined;
  degradedState: DegradedStateCode;
  reasons: string[];
  latencyMs: number;
}

export interface DeterministicEngineConfig {
  logFilePath?: string;
  logRotateBytes?: number;
  clock?: () => string;
}

export class DeterministicEngine {
  private readonly router: SawyerRouter;
  private readonly executionLog: ExecutionLog;
  private readonly configHash: string;
  private readonly providerNames: string[];
  private readonly clock: () => string;

  constructor(
    providers: RuntimeProvider[],
    config: SawyerConfig,
    audit: AuditLogger,
    engineConfig: DeterministicEngineConfig = {}
  ) {
    this.router = new SawyerRouter(providers, config, audit);
    this.executionLog = new ExecutionLog({
      filePath: engineConfig.logFilePath,
      rotateBytes: engineConfig.logRotateBytes
    });
    this.configHash = computeConfigHash(config);
    this.providerNames = providers.map((p) => p.name);
    this.clock = engineConfig.clock ?? (() => new Date().toISOString());
  }

  async execute(
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals
  ): Promise<ExecutionReceipt> {
    const identity = computeRunId({
      taskId: task.id,
      taskType: task.type,
      input: task.input,
      configHash: this.configHash,
      providerNames: this.providerNames
    });

    const startMs = performance.now();

    const routingResult = await this.router.route(
      task,
      tenantId,
      signals,
      identity.runId
    );

    const latencyMs = Math.round(performance.now() - startMs);

    const outputHash = routingResult.result?.output
      ? computeOutputHash(routingResult.result.output)
      : null;

    let degradedState: DegradedStateCode = 'NOMINAL';
    if (routingResult.degraded) {
      const reasons = routingResult.reasons.join(' ');
      if (reasons.includes('no providers available') || reasons.includes('inference failed')) {
        degradedState = 'MODEL_UNAVAILABLE';
      } else {
        degradedState = 'PARTIAL_EXECUTION';
      }
    }

    const logEntry: ExecutionLogEntry = {
      runId: identity.runId,
      inputHash: identity.inputHash,
      outputHash,
      provider: routingResult.decision === 'DENY' ? 'DENY' : String(routingResult.decision),
      model: routingResult.result?.model ?? 'none',
      taskType: task.type,
      degradedState,
      latencyMs,
      costUsd: routingResult.result?.costUsd ?? 0,
      success: routingResult.decision !== 'DENY',
      errorMessage: routingResult.decision === 'DENY' ? routingResult.reasons.join('; ') : null,
      timestampIso: this.clock()
    };

    this.executionLog.append(logEntry);

    return {
      runId: identity.runId,
      inputHash: identity.inputHash,
      outputHash,
      decision: routingResult.decision,
      result: routingResult.result,
      degradedState,
      reasons: routingResult.reasons,
      latencyMs
    };
  }

  getLog(): ExecutionLog {
    return this.executionLog;
  }

  verifyDeterminism(runId: string, expectedInputHash: string): boolean {
    const entry = this.executionLog.findByRunId(runId);
    if (!entry) return false;
    return entry.inputHash === expectedInputHash;
  }

  verifyOutputIntegrity(runId: string, actualOutput: string): boolean {
    const entry = this.executionLog.findByRunId(runId);
    if (!entry || !entry.outputHash) return false;
    return entry.outputHash === computeOutputHash(actualOutput);
  }

  static hashInput(input: string): string {
    return computeInputHash(input);
  }

  getProviderNames(): string[] {
    return [...this.providerNames];
  }

  getDegradedState(): DegradedStateCode {
    return this.executionLog.getLatest()?.degradedState ?? 'NOMINAL';
  }
}
