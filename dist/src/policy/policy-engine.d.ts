import type { AiTask } from '../types/contracts.js';
import type { GovernancePolicy } from '../types/config.js';
import type { RuntimeProvider } from '../providers/provider.js';
export interface PolicyContext {
    tenantId: string;
    model: string;
    requestedTokens: number;
    providerHealthy?: boolean;
}
export interface PolicyDecision {
    allowed: boolean;
    reasons: string[];
}
export declare class PolicyEngine {
    private readonly policy?;
    constructor(policy?: GovernancePolicy | undefined);
    evaluate(task: AiTask, provider: RuntimeProvider, ctx: PolicyContext): PolicyDecision;
}
