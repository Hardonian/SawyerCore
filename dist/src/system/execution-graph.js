import { AuditLogger } from '../observability/audit.js';
import { BillingController } from '../billing/controller.js';
import { SemanticCache } from '../runtime/cache/semantic-cache.js';
import { CompressionEngine, estimateTokens } from '../runtime/compression/compression-engine.js';
import { DeterministicEngine } from '../runtime/core/deterministic-engine.js';
import { computeConfigHash, computeOutputHash, computeRunId } from '../runtime/core/run-identity.js';
import { safeDefaultConfig } from '../runtime/defaults.js';
import { DecisionEngine } from '../intelligence/index.js';
const DEFAULT_SIGNALS = {
    batteryPercent: 100,
    thermalState: 'nominal',
    hardwareAvailable: {
        LOCAL_NPU: false,
        LOCAL_CPU: true,
        LOCAL_GPU: false,
        VLLM_SERVER: true,
        LITELLM_PROXY: false,
        CLOUD_FALLBACK: false
    },
    failureHistory: {}
};
const DEFAULT_GRAPH_CONFIG = {
    cacheTtlMs: 60_000,
    cacheSimilarityThreshold: 1,
    compressionTokenBudget: 4096,
    recordUsage: true,
    defaultSignals: DEFAULT_SIGNALS,
    decisionObjective: {
        reliabilityWeight: 0.55,
        performanceWeight: 0.25,
        costWeight: 0.2
    },
    clock: () => new Date().toISOString()
};
export class UnifiedExecutionGraph {
    providers;
    config;
    audit;
    billing;
    deterministicEngine;
    compressionEngine;
    semanticCache;
    decisionEngine;
    graphConfig;
    providerNames;
    configHash;
    history = [];
    failureHistory = {};
    constructor(providers, config = safeDefaultConfig(), audit = new AuditLogger(), options = {}) {
        this.providers = providers;
        this.config = config;
        this.audit = audit;
        this.billing = new BillingController();
        this.deterministicEngine = new DeterministicEngine(providers, config, audit);
        this.compressionEngine = new CompressionEngine();
        this.semanticCache = new SemanticCache();
        this.decisionEngine = new DecisionEngine();
        this.graphConfig = {
            ...DEFAULT_GRAPH_CONFIG,
            ...options,
            defaultSignals: {
                ...DEFAULT_GRAPH_CONFIG.defaultSignals,
                ...(options.defaultSignals ?? {}),
                hardwareAvailable: {
                    ...DEFAULT_GRAPH_CONFIG.defaultSignals.hardwareAvailable,
                    ...(options.defaultSignals?.hardwareAvailable ?? {})
                },
                failureHistory: {
                    ...DEFAULT_GRAPH_CONFIG.defaultSignals.failureHistory,
                    ...(options.defaultSignals?.failureHistory ?? {})
                }
            }
        };
        this.providerNames = providers.map((provider) => provider.name);
        this.configHash = computeConfigHash(config);
    }
    async execute(task, tenantId, signals) {
        return this.run({ task, tenantId, signals });
    }
    async run(input) {
        const startedAt = performance.now();
        const stages = [];
        const tenantId = input.tenantId.trim();
        const baseSignals = this.mergeSignals(input.signals);
        if (!tenantId) {
            return this.blockedReceipt(input.task, 'unknown', startedAt, stages, ['tenant id required'], 'PARTIAL_EXECUTION');
        }
        const quota = await this.billing.checkTenantQuota(tenantId);
        if (!quota.canExecute) {
            stages.push({ name: 'billing_quota', status: 'blocked', reason: quota.reason ?? 'quota denied execution' });
            return this.blockedReceipt(input.task, tenantId, startedAt, stages, [quota.reason ?? 'quota denied execution'], 'PARTIAL_EXECUTION');
        }
        stages.push({ name: 'billing_quota', status: 'passed', reason: 'tenant quota allows execution' });
        const security = this.validateSecurity(input.task);
        if (security.length > 0) {
            stages.push({ name: 'security_preflight', status: 'blocked', reason: security.join('; ') });
            return this.blockedReceipt(input.task, tenantId, startedAt, stages, security, 'PARTIAL_EXECUTION');
        }
        stages.push({ name: 'security_preflight', status: 'passed', reason: 'policy preflight passed' });
        const { task, compression } = this.prepareTask(input);
        stages.push({
            name: 'compression',
            status: compression.qualityStatus === 'degraded' ? 'degraded' : compression.applied ? 'passed' : 'skipped',
            reason: compression.reason
        });
        if (compression.qualityStatus === 'degraded') {
            return this.blockedReceipt(task, tenantId, startedAt, stages, ['compression quality degraded: required terms removed'], 'PARTIAL_EXECUTION', compression);
        }
        const cacheHit = this.semanticCache.get(task.input, {
            similarityThreshold: this.graphConfig.cacheSimilarityThreshold
        });
        if (cacheHit.hit && cacheHit.value) {
            stages.push({ name: 'semantic_cache', status: 'passed', reason: cacheHit.reason });
            const receipt = this.receiptFromCached(task, tenantId, startedAt, cacheHit.value, {
                hit: true,
                reason: cacheHit.reason,
                semanticHash: cacheHit.semanticHash,
                matchedHash: cacheHit.matchedHash
            }, stages, compression);
            const billing = await this.recordUsage(tenantId, receipt, input.agentRun || task.type === 'agent-planning', 1);
            receipt.graph.billing = billing;
            return receipt;
        }
        stages.push({ name: 'semantic_cache', status: 'skipped', reason: cacheHit.reason });
        const candidates = await this.buildCandidates(task);
        const decision = this.decisionEngine.decide({
            task,
            candidates,
            objective: this.graphConfig.decisionObjective
        });
        stages.push({
            name: 'intelligence_decision',
            status: decision.selectedProvider ? (decision.degraded ? 'degraded' : 'passed') : 'blocked',
            reason: decision.selectedProvider
                ? `preferred provider ${decision.selectedProvider}`
                : decision.degradedReason ?? 'no viable execution path'
        });
        if (!decision.selectedProvider) {
            return this.blockedReceipt(task, tenantId, startedAt, stages, [decision.degradedReason ?? 'no viable execution path'], 'MODEL_UNAVAILABLE', compression, decision);
        }
        const preferredSignals = {
            ...baseSignals,
            preferredProviderName: decision.selectedProvider,
            failureHistory: { ...baseSignals.failureHistory, ...this.failureHistory }
        };
        const receipt = await this.deterministicEngine.execute(task, tenantId, preferredSignals);
        this.recordOutcome(receipt, task);
        const billing = await this.recordUsage(tenantId, receipt, input.agentRun || task.type === 'agent-planning', 1);
        const graph = this.buildTrace({
            stages,
            cache: {
                hit: false,
                reason: cacheHit.reason,
                semanticHash: cacheHit.semanticHash,
                matchedHash: cacheHit.matchedHash
            },
            compression,
            decision,
            billing
        });
        if (receipt.result && receipt.degradedState === 'NOMINAL') {
            this.semanticCache.set(task.input, {
                result: receipt.result,
                decision: receipt.decision,
                degradedState: receipt.degradedState,
                reasons: receipt.reasons
            }, { ttlMs: this.graphConfig.cacheTtlMs });
        }
        return { ...receipt, graph };
    }
    getHistory() {
        return [...this.history];
    }
    recordHistoricalOutcome(entry) {
        this.history.push(entry);
        this.decisionEngine.recordOutcome(entry);
        if (!entry.success) {
            this.failureHistory[entry.provider] = (this.failureHistory[entry.provider] ?? 0) + 1;
        }
    }
    getFailureHistory() {
        return { ...this.failureHistory };
    }
    getProviderNames() {
        return [...this.providerNames];
    }
    getCacheSize() {
        return this.semanticCache.size();
    }
    prepareTask(input) {
        const contextBlocks = input.contextBlocks ?? [];
        const originalTokenEstimate = estimateTokens([
            input.task.input,
            ...contextBlocks.map((block) => block.text)
        ].join('\n\n'));
        if (contextBlocks.length === 0 && originalTokenEstimate <= this.graphConfig.compressionTokenBudget) {
            return {
                task: input.task,
                compression: {
                    applied: false,
                    originalTokenEstimate,
                    finalTokenEstimate: estimateTokens(input.task.input),
                    reductionPercent: 0,
                    qualityStatus: 'not_required',
                    reason: 'prompt within token budget'
                }
            };
        }
        const compressed = this.compressionEngine.compressPrompt({
            instruction: input.task.input,
            contextBlocks,
            requiredTerms: input.requiredTerms,
            tokenBudget: Math.min(input.task.maxContextTokens, this.graphConfig.compressionTokenBudget)
        });
        return {
            task: {
                ...input.task,
                input: compressed.prompt,
                maxContextTokens: Math.min(input.task.maxContextTokens, Math.max(compressed.compressedTokenEstimate, 1))
            },
            compression: {
                applied: true,
                originalTokenEstimate: compressed.originalTokenEstimate,
                finalTokenEstimate: compressed.compressedTokenEstimate,
                reductionPercent: compressed.reductionPercent,
                qualityStatus: compressed.qualityGate.status,
                reason: compressed.qualityGate.reason
            }
        };
    }
    async buildCandidates(task) {
        const candidates = [];
        for (const provider of this.providers) {
            const health = await provider.healthCheck();
            candidates.push({
                provider: provider.name,
                target: provider.target,
                taskType: task.type,
                estimatedLatencyMs: provider.estimateLatency(task),
                estimatedCostUsd: provider.estimateCost(task),
                available: health.healthy,
                supportsTask: provider.supportsTask(task),
                privateDataSupported: provider.getCapabilities().supportsPrivateData
            });
        }
        return candidates.sort((a, b) => a.provider.localeCompare(b.provider));
    }
    async recordUsage(tenantId, receipt, agentRun, stepsCompleted) {
        if (!this.graphConfig.recordUsage) {
            return { recorded: false, records: 0, reason: 'usage recording disabled' };
        }
        try {
            const records = await this.billing.recordTaskUsage(tenantId, receipt.runId, Math.max(receipt.latencyMs, 1), receipt.result ? estimateTokens(receipt.result.output) : 0);
            let count = records.length;
            if (agentRun) {
                await this.billing.recordAgentRunUsage(tenantId, receipt.runId, Math.max(receipt.latencyMs, 1), stepsCompleted);
                count += 1;
            }
            return { recorded: true, records: count, reason: 'usage recorded' };
        }
        catch (error) {
            return { recorded: false, records: 0, reason: `usage recording degraded: ${error.message}` };
        }
    }
    recordOutcome(receipt, task) {
        const provider = receipt.result?.provider ?? receipt.decision;
        const outcome = {
            runId: receipt.runId,
            inputHash: receipt.inputHash,
            outputHash: receipt.outputHash,
            provider,
            model: receipt.result?.model ?? 'none',
            taskType: task.type,
            degradedState: receipt.degradedState,
            latencyMs: receipt.latencyMs,
            costUsd: receipt.result?.costUsd ?? 0,
            success: receipt.decision !== 'DENY' && receipt.degradedState === 'NOMINAL',
            errorMessage: receipt.decision === 'DENY' || receipt.degradedState !== 'NOMINAL'
                ? receipt.reasons.join('; ') || receipt.degradedState
                : null,
            timestampIso: this.graphConfig.clock()
        };
        this.recordHistoricalOutcome(outcome);
    }
    receiptFromCached(task, tenantId, startedAt, cached, cache, stages, compression) {
        const identity = computeRunId({
            taskId: task.id,
            taskType: task.type,
            input: task.input,
            configHash: this.configHash,
            providerNames: this.providerNames
        });
        const result = {
            ...cached.result,
            latencyMs: Math.round(performance.now() - startedAt),
            costUsd: 0
        };
        const receipt = {
            runId: identity.runId,
            inputHash: identity.inputHash,
            outputHash: computeOutputHash(result.output),
            decision: cached.decision,
            result,
            degradedState: cached.degradedState,
            reasons: ['semantic cache hit', ...cached.reasons],
            latencyMs: result.latencyMs
        };
        this.recordOutcome(receipt, task);
        return {
            ...receipt,
            graph: this.buildTrace({
                stages,
                cache,
                compression,
                decision: this.cachedDecision(task, cached),
                billing: { recorded: false, records: 0, reason: 'usage recording pending' }
            })
        };
    }
    blockedReceipt(task, tenantId, startedAt, stages, reasons, degradedState, compression, decision) {
        const identity = computeRunId({
            taskId: task.id,
            taskType: task.type,
            input: task.input,
            configHash: this.configHash,
            providerNames: this.providerNames
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const blockedDecision = decision ?? this.blockedDecision(task, reasons);
        this.audit.log({
            requestId: identity.runId,
            taskId: task.id,
            requestedTask: task.type,
            selectedProvider: 'DENY',
            deniedProviders: [{ provider: 'execution_graph', reason: reasons.join('; ') }],
            policyDecision: 'deny',
            fallbackPath: [],
            degradedState,
            status: 'denied'
        });
        const receipt = {
            runId: identity.runId,
            inputHash: identity.inputHash,
            outputHash: null,
            decision: 'DENY',
            result: undefined,
            degradedState,
            reasons,
            latencyMs,
            graph: this.buildTrace({
                stages,
                cache: {
                    hit: false,
                    reason: 'not_checked',
                    semanticHash: '',
                    matchedHash: null
                },
                compression: compression ?? {
                    applied: false,
                    originalTokenEstimate: estimateTokens(task.input),
                    finalTokenEstimate: estimateTokens(task.input),
                    reductionPercent: 0,
                    qualityStatus: 'not_required',
                    reason: 'not reached'
                },
                decision: blockedDecision,
                billing: { recorded: false, records: 0, reason: 'blocked before usage recording' }
            })
        };
        this.recordOutcome(receipt, task);
        return receipt;
    }
    blockedDecision(task, reasons) {
        return {
            taskId: task.id,
            selectedProvider: null,
            selectedTarget: 'DENY',
            selectedForecast: null,
            scores: [],
            objective: this.graphConfig.decisionObjective,
            actions: ['Deny execution until preflight blockers are resolved.'],
            insights: [],
            degraded: true,
            degradedReason: reasons.join('; ')
        };
    }
    cachedDecision(task, cached) {
        return {
            taskId: task.id,
            selectedProvider: cached.result.provider,
            selectedTarget: cached.result.provider === 'cloud' ? 'CLOUD_FALLBACK' : 'LOCAL_CPU',
            selectedForecast: null,
            scores: [],
            objective: this.graphConfig.decisionObjective,
            actions: ['Serve deterministic semantic cache hit.'],
            insights: [],
            degraded: false,
            degradedReason: null
        };
    }
    buildTrace(input) {
        return {
            stages: [...input.stages],
            cache: input.cache,
            compression: input.compression,
            decision: input.decision,
            billing: input.billing,
            optimization: {
                historySize: this.history.length,
                failureHistory: { ...this.failureHistory },
                preferredProviderName: input.decision.selectedProvider
            }
        };
    }
    validateSecurity(task) {
        const reasons = [];
        if (task.maxBudgetUsd > this.config.policy.maxCostPerRequestUsd) {
            reasons.push('task budget exceeds policy max cost per request');
        }
        if (task.maxContextTokens > this.config.policy.maxTokens) {
            reasons.push('task context exceeds policy max tokens');
        }
        if (task.input.length > this.config.policy.maxRequestBytes) {
            reasons.push('task input exceeds policy max request bytes');
        }
        return reasons;
    }
    mergeSignals(signals) {
        return {
            ...this.graphConfig.defaultSignals,
            ...(signals ?? {}),
            hardwareAvailable: {
                ...this.graphConfig.defaultSignals.hardwareAvailable,
                ...(signals?.hardwareAvailable ?? {})
            },
            failureHistory: {
                ...this.graphConfig.defaultSignals.failureHistory,
                ...(signals?.failureHistory ?? {}),
                ...this.failureHistory
            }
        };
    }
}
