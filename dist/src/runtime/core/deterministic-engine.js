/**
 * Deterministic execution engine.
 * Wraps the router with full provenance tracking:
 * - Hash-based run identity (input → output integrity)
 * - Replayable execution logs
 * - Explicit degraded state reporting
 */
import { SawyerRouter } from '../router.js';
import { computeRunId, computeOutputHash, computeConfigHash, computeInputHash } from './run-identity.js';
import { ExecutionLog } from './execution-log.js';
export class DeterministicEngine {
    router;
    executionLog;
    configHash;
    providerNames;
    clock;
    constructor(providers, config, audit, engineConfig = {}) {
        this.router = new SawyerRouter(providers, config, audit);
        this.executionLog = new ExecutionLog({
            filePath: engineConfig.logFilePath,
            rotateBytes: engineConfig.logRotateBytes
        });
        this.configHash = computeConfigHash(config);
        this.providerNames = providers.map((p) => p.name);
        this.clock = engineConfig.clock ?? (() => new Date().toISOString());
    }
    async execute(task, tenantId, signals) {
        const identity = computeRunId({
            taskId: task.id,
            taskType: task.type,
            input: task.input,
            configHash: this.configHash,
            providerNames: this.providerNames
        });
        const startMs = performance.now();
        const routingResult = await this.router.route(task, tenantId, signals, identity.runId);
        const latencyMs = Math.round(performance.now() - startMs);
        const outputHash = routingResult.result?.output
            ? computeOutputHash(routingResult.result.output)
            : null;
        let degradedState = 'NOMINAL';
        if (routingResult.degraded) {
            const reasons = routingResult.reasons.join(' ');
            if (reasons.includes('no providers available') || reasons.includes('inference failed')) {
                degradedState = 'MODEL_UNAVAILABLE';
            }
            else {
                degradedState = 'PARTIAL_EXECUTION';
            }
        }
        const logEntry = {
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
    getLog() {
        return this.executionLog;
    }
    verifyDeterminism(runId, expectedInputHash) {
        const entry = this.executionLog.findByRunId(runId);
        if (!entry)
            return false;
        return entry.inputHash === expectedInputHash;
    }
    verifyOutputIntegrity(runId, actualOutput) {
        const entry = this.executionLog.findByRunId(runId);
        if (!entry || !entry.outputHash)
            return false;
        return entry.outputHash === computeOutputHash(actualOutput);
    }
    static hashInput(input) {
        return computeInputHash(input);
    }
    getProviderNames() {
        return [...this.providerNames];
    }
    getDegradedState() {
        return this.executionLog.getLatest()?.degradedState ?? 'NOMINAL';
    }
}
