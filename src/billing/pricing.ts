import { PricingTier } from './types';

const pricingTiers = new Map<string, PricingTier>();

const defaultTiers: PricingTier[] = [
  {
    name: 'free',
    stripePriceId: '',
    basePriceUsd: 0,
    usageRates: {
      task: 0,
      compute: 0,
      agent_run: 0,
      api_call: 0,
      storage: 0,
      bandwidth: 0
    },
    limits: {
      maxTasksPerMonth: 100,
      maxComputeMinutesPerMonth: 10,
      maxAgentRunsPerMonth: 10,
      maxStorageGb: 0.5
    }
  },
  {
    name: 'starter',
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID ?? '',
    basePriceUsd: 29,
    usageRates: {
      task: 0.01,
      compute: 0.05,
      agent_run: 0.10,
      api_call: 0.001,
      storage: 0.00,
      bandwidth: 0.00
    },
    limits: {
      maxTasksPerMonth: 1000,
      maxComputeMinutesPerMonth: 100,
      maxAgentRunsPerMonth: 100,
      maxStorageGb: 5
    }
  },
  {
    name: 'pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
    basePriceUsd: 99,
    usageRates: {
      task: 0.005,
      compute: 0.02,
      agent_run: 0.05,
      api_call: 0.0005,
      storage: 0.00,
      bandwidth: 0.00
    },
    limits: {
      maxTasksPerMonth: 10000,
      maxComputeMinutesPerMonth: 1000,
      maxAgentRunsPerMonth: 1000,
      maxStorageGb: 50
    }
  },
  {
    name: 'enterprise',
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? '',
    basePriceUsd: 499,
    usageRates: {
      task: 0.001,
      compute: 0.005,
      agent_run: 0.01,
      api_call: 0.0001,
      storage: 0.00,
      bandwidth: 0.00
    },
    limits: {
      maxTasksPerMonth: 100000,
      maxComputeMinutesPerMonth: 10000,
      maxAgentRunsPerMonth: 10000,
      maxStorageGb: 500
    }
  }
];

export class PricingCatalog {
  private static tierAssignments = new Map<string, string>();

  static initialize(): void {
    for (const tier of defaultTiers) {
      pricingTiers.set(tier.name, tier);
    }
  }

  static registerTier(tier: PricingTier): void {
    pricingTiers.set(tier.name, tier);
  }

  static getTier(name: string): PricingTier | undefined {
    return pricingTiers.get(name);
  }

  static getAllTiers(): PricingTier[] {
    return Array.from(pricingTiers.values());
  }

  static assignTier(tenantId: string, tierName: string): void {
    if (!pricingTiers.has(tierName)) {
      throw new Error(`Pricing tier "${tierName}" not found`);
    }
    PricingCatalog.tierAssignments.set(tenantId, tierName);
  }

  static getTierForTenant(tenantId: string): PricingTier | undefined {
    const tierName = PricingCatalog.tierAssignments.get(tenantId);
    if (!tierName) return undefined;
    return pricingTiers.get(tierName);
  }

  static calculateCost(
    tenantId: string,
    eventType: string,
    quantity: number
  ): number {
    const tier = PricingCatalog.getTierForTenant(tenantId);
    if (!tier) return 0;
    
    const rate = tier.usageRates[eventType as keyof typeof tier.usageRates] ?? 0;
    return quantity * rate;
  }

  static checkLimits(tenantId: string, eventType: string, currentUsage: number): { allowed: boolean; limit?: number } {
    const tier = PricingCatalog.getTierForTenant(tenantId);
    if (!tier?.limits) return { allowed: true };

    const limitMap: Record<string, keyof typeof tier.limits> = {
      task: 'maxTasksPerMonth',
      compute: 'maxComputeMinutesPerMonth',
      agent_run: 'maxAgentRunsPerMonth',
      storage: 'maxStorageGb'
    };

    const limitKey = limitMap[eventType];
    if (!limitKey) return { allowed: true };
    
    const limit = tier.limits[limitKey];
    if (!limit) return { allowed: true };

    return {
      allowed: currentUsage < limit,
      limit
    };
  }
}

PricingCatalog.initialize();
