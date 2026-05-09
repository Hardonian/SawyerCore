import { PolicyEngine } from '../policy/policy-engine.js';
import { SawyerOptimizationEngine } from './optimization-engine.js';
export class SawyerRouter {
    providers;
    config;
    audit;
    optimizer = new SawyerOptimizationEngine();
    policyEngine;
    constructor(providers, config, audit) {
        this.providers = providers;
        this.config = config;
        this.audit = audit;
        this.policyEngine = new PolicyEngine(config.policy);
    }
    async route(task, tenantId, signals, requestId = `${task.id}-${Date.now()}`) {
        const denied = [];
        const scored = [];
        const blockedProviderNames = new Set(signals.blockedProviderNames ?? []);
        const results = await Promise.all(this.providers.map(async (provider) => {
            if (blockedProviderNames.has(provider.name)) {
                return { provider, state: 'denied', reason: 'blocked by execution graph preference' };
            }
            const health = await provider.healthCheck();
            if (!health.healthy) {
                return { provider, state: 'denied', reason: health.reason ?? 'unhealthy' };
            }
            const model = provider.name === 'vllm' ? this.config.providers.vllm.model : provider.name;
            const policyDecision = this.policyEngine.evaluate(task, provider, {
                tenantId,
                model,
                requestedTokens: task.maxContextTokens,
                providerHealthy: health.healthy
            });
            if (!policyDecision.allowed) {
                return { provider, state: 'denied', reason: policyDecision.reasons.join('; ') };
            }
            const scoring = this.optimizer.score(task, provider, signals);
            return { provider, state: 'scored', score: scoring.total, breakdown: scoring.breakdown };
        }));
        for (const res of results) {
            if (res.state === 'denied') {
                denied.push({ provider: res.provider.name, reason: res.reason });
            }
            else if (res.state === 'scored') {
                scored.push({ provider: res.provider, score: res.score, breakdown: res.breakdown });
            }
        }
        scored.sort((a, b) => b.score - a.score || a.provider.name.localeCompare(b.provider.name));
        const chosen = scored[0];
        if (!chosen) {
            this.audit.log({
                requestId,
                taskId: task.id,
                requestedTask: task.type,
                selectedProvider: 'DENY',
                deniedProviders: denied,
                policyDecision: 'deny',
                fallbackPath: [],
                degradedState: 'no providers available',
                status: 'denied'
            });
            return { decision: 'DENY', reasons: denied.map((d) => `${d.provider}: ${d.reason}`), degraded: true };
        }
        try {
            const result = await chosen.provider.runInference(task);
            this.audit.log({
                requestId,
                taskId: task.id,
                requestedTask: task.type,
                selectedProvider: chosen.provider.name,
                deniedProviders: denied,
                costEstimateUsd: chosen.provider.estimateCost(task),
                latencyEstimateMs: chosen.provider.estimateLatency(task),
                policyDecision: 'allow',
                scoringBreakdown: chosen.breakdown,
                fallbackPath: scored.map((s) => s.provider.name),
                status: 'success'
            });
            return { decision: chosen.provider.target, result, reasons: [] };
        }
        catch (error) {
            const reason = `inference failed: ${error.message}`;
            this.audit.log({
                requestId,
                taskId: task.id,
                requestedTask: task.type,
                selectedProvider: chosen.provider.name,
                deniedProviders: [...denied, { provider: chosen.provider.name, reason }],
                policyDecision: 'deny',
                scoringBreakdown: chosen.breakdown,
                fallbackPath: scored.map((s) => s.provider.name),
                degradedState: reason,
                status: 'failed'
            });
            return { decision: 'DENY', reasons: [reason], degraded: true };
        }
    }
}
