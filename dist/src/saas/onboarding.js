import { randomUUID } from 'crypto';
import { TenantManager } from '../api/tenant-manager.js';
import { UsageTracker } from '../billing/usage-tracker.js';
import { PricingCatalog } from '../billing/pricing.js';
import { TenantIsolationController } from '../tenancy/controller.js';
import { GrowthEngine } from '../growth/engine.js';
export class OnboardingFlow {
    tenantManager;
    usageTracker;
    isolationController;
    growthEngine;
    constructor() {
        this.tenantManager = TenantManager.getInstance();
        this.usageTracker = UsageTracker.getInstance();
        this.isolationController = TenantIsolationController.getInstance();
        this.growthEngine = GrowthEngine.getInstance();
    }
    async onboard(input) {
        const tenantId = randomUUID();
        const plan = input.plan ?? 'free';
        const tier = PricingCatalog.getTier(plan);
        if (!tier) {
            throw new Error(`Invalid plan: ${plan}`);
        }
        PricingCatalog.assignTier(tenantId, plan);
        const tenant = await this.tenantManager.createTenant({
            id: tenantId,
            name: input.name,
            email: input.email,
            plan,
            resourceLimits: {
                maxConcurrentTasks: tier.limits?.maxTasksPerMonth ?? 100,
                maxStorageBytes: (tier.limits?.maxStorageGb ?? 0.5) * 1_000_000_000,
                maxApiCallsPerMinute: 100,
                maxAgents: tier.limits?.maxAgentRunsPerMonth ?? 10
            },
            metadata: input.metadata
        });
        const { key } = await this.tenantManager.createApiKey(tenantId, 'Default API Key', ['tasks:execute', 'tasks:read', 'agents:manage', 'usage:read']);
        await this.usageTracker.setResourceLimits({
            tenantId,
            maxConcurrentTasks: tier.limits?.maxTasksPerMonth ?? 100,
            maxStorageBytes: (tier.limits?.maxStorageGb ?? 0.5) * 1_000_000_000,
            maxApiCallsPerMinute: 100,
            maxAgents: tier.limits?.maxAgentRunsPerMonth ?? 10,
            enabled: true
        });
        await this.isolationController.createContext(tenantId, key, ['tasks:execute', 'tasks:read', 'agents:manage', 'usage:read'], tenant.resourceLimits);
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);
        let referralCode;
        if (input.referralCode) {
            const referral = await this.tenantManager.getReferralByCode(input.referralCode);
            if (referral && referral.status === 'pending') {
                await this.tenantManager.completeReferral(input.referralCode);
                referralCode = input.referralCode;
            }
        }
        return {
            tenantId,
            apiKey: key,
            plan,
            trialEndsAt,
            referralCode
        };
    }
    async getOnboardingStatus(tenantId) {
        const tenant = await this.tenantManager.getTenant(tenantId);
        if (!tenant)
            return null;
        const billing = new (await import('../billing/controller.js')).BillingController();
        const usage = await this.usageTracker.getCurrentPeriodUsage(tenantId);
        const quota = await billing.checkTenantQuota(tenantId);
        return { tenant, usage, quota };
    }
}
