import { PricingTier } from './types.js';
export declare class PricingCatalog {
    private static tierAssignments;
    static initialize(): void;
    static registerTier(tier: PricingTier): void;
    static getTier(name: string): PricingTier | undefined;
    static getAllTiers(): PricingTier[];
    static assignTier(tenantId: string, tierName: string): void;
    static getTierForTenant(tenantId: string): PricingTier | undefined;
    static calculateCost(tenantId: string, eventType: string, quantity: number): number;
    static checkLimits(tenantId: string, eventType: string, currentUsage: number): {
        allowed: boolean;
        limit?: number;
    };
}
