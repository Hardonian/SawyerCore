import type { AiTask, InferenceResult } from '../types/contracts.js';
import type { RuntimeProvider, ProviderTarget } from '../providers/provider.js';
import type { SawyerConfig } from '../types/config.js';
import { type RoutingSignals } from './optimization-engine.js';
import { AuditLogger } from '../observability/audit.js';
export type RoutingDecision = ProviderTarget | 'DENY';
export interface RoutingResult {
    decision: RoutingDecision;
    result?: InferenceResult;
    reasons: string[];
}
export declare class SawyerRouter {
    private readonly providers;
    private readonly config;
    private readonly audit;
    private readonly optimizer;
    private readonly policyEngine;
    constructor(providers: RuntimeProvider[], config: SawyerConfig, audit: AuditLogger);
    route(task: AiTask, tenantId: string, signals: RoutingSignals, requestId?: string): Promise<{
        decision: RoutingDecision;
        result?: InferenceResult;
        reasons: string[];
        degraded?: boolean;
    }>;
}
