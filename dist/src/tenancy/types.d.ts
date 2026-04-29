import { z } from 'zod';
import { Request } from 'express';
export declare const TenantContextSchema: z.ZodObject<{
    tenantId: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    requestId: z.ZodString;
    timestamp: z.ZodDate;
    scopes: z.ZodArray<z.ZodString, "many">;
    resourceLimits: z.ZodObject<{
        maxConcurrentTasks: z.ZodNumber;
        maxStorageBytes: z.ZodNumber;
        maxApiCallsPerMinute: z.ZodNumber;
        maxAgents: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    }, {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    }>;
}, "strip", z.ZodTypeAny, {
    tenantId: string;
    scopes: string[];
    resourceLimits: {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    };
    timestamp: Date;
    requestId: string;
    apiKey?: string | undefined;
}, {
    tenantId: string;
    scopes: string[];
    resourceLimits: {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    };
    timestamp: Date;
    requestId: string;
    apiKey?: string | undefined;
}>;
export type TenantContext = z.infer<typeof TenantContextSchema>;
export interface AuthenticatedTenantRequest extends Request {
    tenantContext: TenantContext;
    tenantId: string;
}
export declare const TenantIsolationError: z.ZodObject<{
    type: z.ZodEnum<["tenant_not_found", "invalid_api_key", "quota_exceeded", "scope_violation", "cross_tenant_access", "rate_limit_exceeded"]>;
    message: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "tenant_not_found" | "invalid_api_key" | "quota_exceeded" | "scope_violation" | "cross_tenant_access" | "rate_limit_exceeded";
    timestamp: Date;
    tenantId?: string | undefined;
}, {
    message: string;
    type: "tenant_not_found" | "invalid_api_key" | "quota_exceeded" | "scope_violation" | "cross_tenant_access" | "rate_limit_exceeded";
    timestamp: Date;
    tenantId?: string | undefined;
}>;
export type TenantIsolationError = z.infer<typeof TenantIsolationError>;
export declare const RateLimitConfigSchema: z.ZodObject<{
    windowMs: z.ZodNumber;
    maxRequests: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    windowMs: number;
    maxRequests: number;
}, {
    windowMs: number;
    maxRequests: number;
}>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
