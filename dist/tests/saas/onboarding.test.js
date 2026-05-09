import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingFlow } from '../../src/saas/onboarding.js';
import { TenantManager } from '../../src/api/tenant-manager.js';
import { PricingCatalog } from '../../src/billing/pricing.js';
describe('Onboarding Flow', () => {
    let onboarding;
    let tenantManager;
    beforeEach(async () => {
        onboarding = new OnboardingFlow();
        tenantManager = TenantManager.getInstance();
        await tenantManager.clearTenantData('onboarded-tenant');
    });
    describe('Tenant Creation', () => {
        it('creates tenant with default free plan', async () => {
            const result = await onboarding.onboard({
                name: 'New User',
                email: 'newuser@example.com'
            });
            expect(result.tenantId).toBeDefined();
            expect(result.apiKey).toBeDefined();
            expect(result.plan).toBe('free');
            expect(result.apiKey.startsWith('sk_')).toBe(true);
            expect(result.trialEndsAt).toBeInstanceOf(Date);
        });
        it('creates tenant with specified plan', async () => {
            const result = await onboarding.onboard({
                name: 'Pro User',
                email: 'prouser@example.com',
                plan: 'starter'
            });
            expect(result.plan).toBe('starter');
        });
        it('assigns correct tier pricing after onboarding', async () => {
            const result = await onboarding.onboard({
                name: 'Tier User',
                email: 'tier@example.com',
                plan: 'pro'
            });
            const tier = PricingCatalog.getTierForTenant(result.tenantId);
            expect(tier).toBeDefined();
            expect(tier?.name).toBe('pro');
        });
        it('creates tenant with correct resource limits', async () => {
            const result = await onboarding.onboard({
                name: 'Limit User',
                email: 'limits@example.com',
                plan: 'starter'
            });
            const tenant = await tenantManager.getTenant(result.tenantId);
            expect(tenant).not.toBeNull();
            expect(tenant?.resourceLimits.maxConcurrentTasks).toBeGreaterThan(0);
            expect(tenant?.resourceLimits.maxApiCallsPerMinute).toBeGreaterThan(0);
        });
        it('fails for invalid plan', async () => {
            await expect(onboarding.onboard({
                name: 'Invalid User',
                email: 'invalid@example.com',
                plan: 'nonexistent'
            })).rejects.toThrow('Invalid plan');
        });
    });
    describe('Referral Processing', () => {
        it('applies referral code during onboarding', async () => {
            const referrer = await onboarding.onboard({
                name: 'Referrer',
                email: 'referrer@example.com'
            });
            const referral = await tenantManager.createReferral(referrer.tenantId, 'referred@example.com');
            const referred = await onboarding.onboard({
                name: 'Referred User',
                email: 'referred@example.com',
                referralCode: referral.code
            });
            expect(referred.referralCode).toBe(referral.code);
        });
        it('handles invalid referral codes gracefully', async () => {
            const result = await onboarding.onboard({
                name: 'No Referral',
                email: 'noreferral@example.com',
                referralCode: 'invalid-code'
            });
            expect(result.tenantId).toBeDefined();
            expect(result.referralCode).toBeUndefined();
        });
    });
    describe('Onboarding Status', () => {
        it('returns onboarding status for existing tenant', async () => {
            const result = await onboarding.onboard({
                name: 'Status User',
                email: 'status@example.com'
            });
            const status = await onboarding.getOnboardingStatus(result.tenantId);
            expect(status).not.toBeNull();
            expect(status?.tenant).not.toBeNull();
            expect(status?.quota).toBeDefined();
        });
        it('returns null for non-existent tenant', async () => {
            const status = await onboarding.getOnboardingStatus('non-existent');
            expect(status).toBeNull();
        });
    });
});
