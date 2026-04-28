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

  async route(task: AiTask, tenantId: string, signals: RoutingSignals): Promise<RoutingResult> {
    const denied: Array<{ provider: string; reason: string }> = [];
    const scored: Array<{ provider: RuntimeProvider; score: number }> = [];

    for (const provider of this.providers) {
      const health = await provider.healthCheck();
      if (!health.healthy) {
        denied.push({ provider: provider.name, reason: health.reason ?? 'unhealthy' });
        continue;
      }

      const policyDecision = this.policyEngine.evaluate(task, provider, {
        tenantId,
        model: `${provider.name}-default-model`,
        requestedTokens: task.maxContextTokens
      });

      if (!policyDecision.allowed) {
        denied.push({ provider: provider.name, reason: policyDecision.reasons.join('; ') });
        continue;
      }

      scored.push({ provider, score: this.optimizer.score(task, provider, signals) });
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      this.audit.log({
        taskId: task.id,
        requestedTask: task.type,
        selectedProvider: 'DENY',
        deniedProviders: denied,
        policyDecision: 'deny',
        fallbackPath: [],
        degradedState: 'no providers available',
        status: 'denied'
      });
      return { decision: 'DENY', reasons: denied.map((d) => `${d.provider}: ${d.reason}`) };
    }

    for (const candidate of scored) {
      try {
        const result = await candidate.provider.runInference(task);
        this.audit.log({
          taskId: task.id,
          requestedTask: task.type,
          selectedProvider: candidate.provider.name,
          deniedProviders: denied,
          costEstimateUsd: candidate.provider.estimateCost(task),
          latencyEstimateMs: candidate.provider.estimateLatency(task),
          policyDecision: 'allow',
          fallbackPath: scored.map((s) => s.provider.name),
          status: 'success'
        });
        return { decision: candidate.provider.target, result, reasons: [] };
      } catch (error) {
        denied.push({ provider: candidate.provider.name, reason: (error as Error).message });
      }
    }

    this.audit.log({
      taskId: task.id,
      requestedTask: task.type,
      selectedProvider: 'DENY',
      deniedProviders: denied,
      policyDecision: 'deny',
      fallbackPath: scored.map((s) => s.provider.name),
      degradedState: 'providers failed at runtime',
      status: 'failed'
    });

    return { decision: 'DENY', reasons: denied.map((d) => `${d.provider}: ${d.reason}`) };
  }
}
