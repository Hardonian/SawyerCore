import { z } from 'zod';

export const UsageEventType = z.enum([
  'task',
  'compute',
  'agent_run',
  'api_call',
  'storage',
  'bandwidth'
]);

export type UsageEventType = z.infer<typeof UsageEventType>;

export const UsageRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  eventType: UsageEventType,
  quantity: z.number().positive(),
  unit: z.string(),
  timestamp: z.date(),
  runId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const PricingTierSchema = z.object({
  name: z.string(),
  stripePriceId: z.string(),
  basePriceUsd: z.number().nonnegative(),
  usageRates: z.record(UsageEventType, z.number().nonnegative()),
  limits: z.object({
    maxTasksPerMonth: z.number().optional(),
    maxComputeMinutesPerMonth: z.number().optional(),
    maxAgentRunsPerMonth: z.number().optional(),
    maxStorageGb: z.number().optional()
  }).optional()
});

export type PricingTier = z.infer<typeof PricingTierSchema>;

export const StripeCustomerSchema = z.object({
  stripeCustomerId: z.string(),
  tenantId: z.string(),
  email: z.string().email(),
  subscriptionId: z.string().optional(),
  subscriptionStatus: z.enum([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'paused'
  ]).optional(),
  currentPeriodEnd: z.date().optional(),
  pricingTier: z.string().optional()
});

export type StripeCustomer = z.infer<typeof StripeCustomerSchema>;

export const BillingPeriodSchema = z.object({
  tenantId: z.string(),
  periodStart: z.date(),
  periodEnd: z.date(),
  usageRecords: z.array(UsageRecordSchema),
  totalCostUsd: z.number().nonnegative(),
  invoiced: z.boolean(),
  stripeInvoiceId: z.string().optional()
});

export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;

export const TenantResourceLimitsSchema = z.object({
  tenantId: z.string(),
  maxConcurrentTasks: z.number().positive(),
  maxStorageBytes: z.number().positive(),
  maxApiCallsPerMinute: z.number().positive(),
  maxAgents: z.number().positive(),
  allowedProviders: z.array(z.string()).optional(),
  enabled: z.boolean()
});

export type TenantResourceLimits = z.infer<typeof TenantResourceLimitsSchema>;
