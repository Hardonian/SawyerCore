import type { AiTask } from '../types/contracts.js';
import type { GovernancePolicy } from '../types/config.js';
import type { RuntimeProvider } from '../providers/provider.js';

export interface PolicyContext {
  tenantId: string;
  model: string;
  requestedTokens: number;
}

export interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
}

export class PolicyEngine {
  constructor(private readonly policy?: GovernancePolicy) {}

  evaluate(task: AiTask, provider: RuntimeProvider, ctx: PolicyContext): PolicyDecision {
    const reasons: string[] = [];
    if (!this.policy) {
      return { allowed: false, reasons: ['missing policy: fail closed'] };
    }

    const tenantPerm = this.policy.tenantPermissions[ctx.tenantId];
    if (!tenantPerm) reasons.push('missing tenant permission');

    if (this.policy.requireAudit === false) {
      reasons.push('audit logging must be enabled');
    }

    if (this.policy.denyModelList.includes(ctx.model)) reasons.push('model explicitly denied');
    if (this.policy.allowModelList.length > 0 && !this.policy.allowModelList.includes(ctx.model)) {
      reasons.push('model not on allow list');
    }

    if (ctx.requestedTokens > this.policy.maxTokens || ctx.requestedTokens > task.maxContextTokens) {
      reasons.push('token/context limit exceeded');
    }

    const cost = provider.estimateCost(task);
    if (cost > this.policy.maxCostPerRequestUsd || cost > task.maxBudgetUsd) {
      reasons.push('cost cap exceeded');
    }

    const cloudLike = provider.target === 'CLOUD_FALLBACK' || provider.target === 'LITELLM_PROXY';
    if (cloudLike) {
      if (!tenantPerm?.cloudAllowed) reasons.push('tenant cloud egress denied');
      if (!this.policy.cloudEgressAllowedFor.includes(task.inputClassification as 'public' | 'internal')) {
        reasons.push('classification blocked for cloud egress');
      }
      if (task.inputClassification === 'private' || task.inputClassification === 'sensitive') {
        reasons.push('private/sensitive data cannot route to cloud');
      }
      if (task.privacyRequirement === 'local-only') reasons.push('task requires local-only execution');
    }

    if (!task.fallbackAllowed && cloudLike) reasons.push('task fallback disabled');
    if (!this.policy.fallbackAllowed && cloudLike) reasons.push('policy fallback disabled');

    return { allowed: reasons.length === 0, reasons };
  }
}
