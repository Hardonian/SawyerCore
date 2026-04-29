import { z } from 'zod';
export declare const UsageEventType: z.ZodEnum<["task", "compute", "agent_run", "api_call", "storage", "bandwidth"]>;
export type UsageEventType = z.infer<typeof UsageEventType>;
export declare const UsageRecordSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    eventType: z.ZodEnum<["task", "compute", "agent_run", "api_call", "storage", "bandwidth"]>;
    quantity: z.ZodNumber;
    unit: z.ZodString;
    timestamp: z.ZodDate;
    runId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    timestamp: Date;
    eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
    quantity: number;
    unit: string;
    runId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    tenantId: string;
    timestamp: Date;
    eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
    quantity: number;
    unit: string;
    runId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export declare const PricingTierSchema: z.ZodObject<{
    name: z.ZodString;
    stripePriceId: z.ZodString;
    basePriceUsd: z.ZodNumber;
    usageRates: z.ZodRecord<z.ZodEnum<["task", "compute", "agent_run", "api_call", "storage", "bandwidth"]>, z.ZodNumber>;
    limits: z.ZodOptional<z.ZodObject<{
        maxTasksPerMonth: z.ZodOptional<z.ZodNumber>;
        maxComputeMinutesPerMonth: z.ZodOptional<z.ZodNumber>;
        maxAgentRunsPerMonth: z.ZodOptional<z.ZodNumber>;
        maxStorageGb: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxTasksPerMonth?: number | undefined;
        maxComputeMinutesPerMonth?: number | undefined;
        maxAgentRunsPerMonth?: number | undefined;
        maxStorageGb?: number | undefined;
    }, {
        maxTasksPerMonth?: number | undefined;
        maxComputeMinutesPerMonth?: number | undefined;
        maxAgentRunsPerMonth?: number | undefined;
        maxStorageGb?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    stripePriceId: string;
    basePriceUsd: number;
    usageRates: Partial<Record<"task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth", number>>;
    limits?: {
        maxTasksPerMonth?: number | undefined;
        maxComputeMinutesPerMonth?: number | undefined;
        maxAgentRunsPerMonth?: number | undefined;
        maxStorageGb?: number | undefined;
    } | undefined;
}, {
    name: string;
    stripePriceId: string;
    basePriceUsd: number;
    usageRates: Partial<Record<"task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth", number>>;
    limits?: {
        maxTasksPerMonth?: number | undefined;
        maxComputeMinutesPerMonth?: number | undefined;
        maxAgentRunsPerMonth?: number | undefined;
        maxStorageGb?: number | undefined;
    } | undefined;
}>;
export type PricingTier = z.infer<typeof PricingTierSchema>;
export declare const StripeCustomerSchema: z.ZodObject<{
    stripeCustomerId: z.ZodString;
    tenantId: z.ZodString;
    email: z.ZodString;
    subscriptionId: z.ZodOptional<z.ZodString>;
    subscriptionStatus: z.ZodOptional<z.ZodEnum<["active", "trialing", "past_due", "canceled", "incomplete", "incomplete_expired", "paused"]>>;
    currentPeriodEnd: z.ZodOptional<z.ZodDate>;
    pricingTier: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    email: string;
    stripeCustomerId: string;
    subscriptionId?: string | undefined;
    subscriptionStatus?: "active" | "past_due" | "trialing" | "canceled" | "incomplete" | "incomplete_expired" | "paused" | undefined;
    currentPeriodEnd?: Date | undefined;
    pricingTier?: string | undefined;
}, {
    tenantId: string;
    email: string;
    stripeCustomerId: string;
    subscriptionId?: string | undefined;
    subscriptionStatus?: "active" | "past_due" | "trialing" | "canceled" | "incomplete" | "incomplete_expired" | "paused" | undefined;
    currentPeriodEnd?: Date | undefined;
    pricingTier?: string | undefined;
}>;
export type StripeCustomer = z.infer<typeof StripeCustomerSchema>;
export declare const BillingPeriodSchema: z.ZodObject<{
    tenantId: z.ZodString;
    periodStart: z.ZodDate;
    periodEnd: z.ZodDate;
    usageRecords: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        tenantId: z.ZodString;
        eventType: z.ZodEnum<["task", "compute", "agent_run", "api_call", "storage", "bandwidth"]>;
        quantity: z.ZodNumber;
        unit: z.ZodString;
        timestamp: z.ZodDate;
        runId: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        tenantId: string;
        timestamp: Date;
        eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
        quantity: number;
        unit: string;
        runId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        tenantId: string;
        timestamp: Date;
        eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
        quantity: number;
        unit: string;
        runId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    totalCostUsd: z.ZodNumber;
    invoiced: z.ZodBoolean;
    stripeInvoiceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    usageRecords: {
        id: string;
        tenantId: string;
        timestamp: Date;
        eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
        quantity: number;
        unit: string;
        runId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    totalCostUsd: number;
    invoiced: boolean;
    stripeInvoiceId?: string | undefined;
}, {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    usageRecords: {
        id: string;
        tenantId: string;
        timestamp: Date;
        eventType: "task" | "compute" | "agent_run" | "api_call" | "storage" | "bandwidth";
        quantity: number;
        unit: string;
        runId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    totalCostUsd: number;
    invoiced: boolean;
    stripeInvoiceId?: string | undefined;
}>;
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;
export declare const TenantResourceLimitsSchema: z.ZodObject<{
    tenantId: z.ZodString;
    maxConcurrentTasks: z.ZodNumber;
    maxStorageBytes: z.ZodNumber;
    maxApiCallsPerMinute: z.ZodNumber;
    maxAgents: z.ZodNumber;
    allowedProviders: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    enabled: boolean;
    maxConcurrentTasks: number;
    maxStorageBytes: number;
    maxApiCallsPerMinute: number;
    maxAgents: number;
    allowedProviders?: string[] | undefined;
}, {
    tenantId: string;
    enabled: boolean;
    maxConcurrentTasks: number;
    maxStorageBytes: number;
    maxApiCallsPerMinute: number;
    maxAgents: number;
    allowedProviders?: string[] | undefined;
}>;
export type TenantResourceLimits = z.infer<typeof TenantResourceLimitsSchema>;
