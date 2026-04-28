import type { AiTask, InferenceResult } from '../types/contracts.js';
import type { RuntimeProvider, ProviderTarget } from '../providers/provider.js';
import type { SawyerConfig } from '../types/config.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { SawyerOptimizationEngine, type RoutingSignals } from './optimization-engine.js';
import { AuditLogger } from '../observability/audit.js';

export type RoutingDecision = ProviderTarget | 'DENY';

export interface RoutingResult {
  decision: RoutingDecision;
  result?: InferenceResult;
  reasons: string[];
}

export class SawyerRouter {
  private readonly optimizer = new SawyerOptimizationEngine();
  private readonly policyEngine: PolicyEngine;

  constructor(
    private readonly providers: RuntimeProvider[],
    private readonly config: SawyerConfig,
    private readonly audit: AuditLogger
  ) {
    this.policyEngine = new PolicyEngine(config.policy);
  }

  async route(
    task: AiTask,
    tenantId: string,
    signals: RoutingSignals,
    requestId = `${task.id}-${Date.now()}`
  ): Promise<{ decision: RoutingDecision; result?: InferenceResult; reasons: string[]; degraded?: boolean }> {
    const denied: Array<{ provider: string; reason: string }> = [];
    const scored: Array<{ provider: RuntimeProvider; score: number; breakdown: Record<string, number> }> = [];

    for (const provider of this.providers) {
      const health = await provider.healthCheck();
      if (!health.healthy) {
        denied.push({ provider: provider.name, reason: health.reason ?? 'unhealthy' });
        continue;
      }
      const model = provider.name === 'vllm' ? this.config.providers.vllm.model : provider.name;
      const policyDecision = this.policyEngine.evaluate(task, provider, {
        tenantId,
        model,
        requestedTokens: task.maxContextTokens,
        providerHealthy: health.healthy
      });

      if (!policyDecision.allowed) {
        denied.push({ provider: provider.name, reason: policyDecision.reasons.join('; ') });
        continue;
      }
      const scoring = this.optimizer.score(task, provider, signals);
      scored.push({ provider, score: scoring.total, breakdown: scoring.breakdown });
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
    } catch (error) {
      const reason = `inference failed: ${(error as Error).message}`;
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
