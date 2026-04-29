import { z } from 'zod';

export const TenantContextSchema = z.object({
  tenantId: z.string(),
  apiKey: z.string().optional(),
  requestId: z.string(),
  timestamp: z.date(),
  scopes: z.array(z.string()),
  resourceLimits: z.object({
    maxConcurrentTasks: z.number(),
    maxStorageBytes: z.number(),
    maxApiCallsPerMinute: z.number(),
    maxAgents: z.number()
  })
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

export const TenantIsolationError = z.object({
  type: z.enum([
    'tenant_not_found',
    'invalid_api_key',
    'quota_exceeded',
    'scope_violation',
    'cross_tenant_access',
    'rate_limit_exceeded'
  ]),
  message: z.string(),
  tenantId: z.string().optional(),
  timestamp: z.date()
});

export type TenantIsolationError = z.infer<typeof TenantIsolationError>;

export const RateLimitConfigSchema = z.object({
  windowMs: z.number().positive(),
  maxRequests: z.number().positive()
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
