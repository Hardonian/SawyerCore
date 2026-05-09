import { TenantManager } from '../api/tenant-manager.js';
import { UsageTracker } from '../billing/usage-tracker.js';
export interface OnboardingInput {
    name: string;
    email: string;
    plan?: string;
    referralCode?: string;
    metadata?: Record<string, unknown>;
}
export interface OnboardingResult {
    tenantId: string;
    apiKey: string;
    plan: string;
    trialEndsAt: Date;
    referralCode?: string;
    welcomeShareUrl?: string;
}
export declare class OnboardingFlow {
    private tenantManager;
    private usageTracker;
    private isolationController;
    private growthEngine;
    constructor();
    onboard(input: OnboardingInput): Promise<OnboardingResult>;
    getOnboardingStatus(tenantId: string): Promise<{
        tenant: Awaited<ReturnType<TenantManager['getTenant']>>;
        usage: Awaited<ReturnType<UsageTracker['getCurrentPeriodUsage']>>;
        quota: Awaited<ReturnType<import('../billing/controller.js').BillingController['checkTenantQuota']>>;
    } | null>;
}
