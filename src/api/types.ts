import { z } from 'zod';
import { Request } from 'express';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  tenantId: z.string(),
  name: z.string(),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  lastUsedAt: z.date().optional(),
  scopes: z.array(z.string()),
  rateLimitPerMinute: z.number().positive().optional()
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
 
 export interface AuthenticatedRequest extends Request {
   tenantId: string;
   apiKey: ApiKey;
 }

export const ApiRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  apiKeyId: z.string(),
  endpoint: z.string(),
  method: z.string(),
  timestamp: z.date(),
  latencyMs: z.number(),
  statusCode: z.number(),
  requestBodySize: z.number().optional(),
  responseBodySize: z.number().optional()
});

export type ApiRequest = z.infer<typeof ApiRequestSchema>;

export const TaskInputSchema = z.object({
  type: z.enum(['chat', 'completion', 'embedding', 'classification', 'summarization']),
  input: z.string(),
  model: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  privacy: z.enum(['public', 'private', 'sensitive']).optional()
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

export const TaskResultSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  runId: z.string(),
  output: z.unknown(),
  provider: z.string(),
  latencyMs: z.number(),
  costUsd: z.number(),
  tokensUsed: z.number().optional(),
  degradedState: z.enum(['NOMINAL', 'MODEL_UNAVAILABLE', 'LOW_MEMORY', 'PARTIAL_EXECUTION']),
  timestamp: z.date()
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

export const AgentConfigSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(z.object({
    type: z.string(),
    config: z.record(z.unknown())
  })),
  triggers: z.array(z.enum(['manual', 'schedule', 'webhook'])),
  enabled: z.boolean()
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ReferralSchema = z.object({
  id: z.string().uuid(),
  referrerTenantId: z.string(),
  referredEmail: z.string().email(),
  code: z.string(),
  status: z.enum(['pending', 'completed', 'expired']),
  createdAt: z.date(),
  convertedAt: z.date().optional()
});

export type Referral = z.infer<typeof ReferralSchema>;

export const ShareableOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  runId: z.string(),
  title: z.string(),
  content: z.unknown(),
  publicUrl: z.string(),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  views: z.number(),
  password: z.string().optional()
});

export type ShareableOutput = z.infer<typeof ShareableOutputSchema>;

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.date(),
  status: z.enum(['active', 'suspended', 'trial', 'past_due']),
  plan: z.string(),
  resourceLimits: z.object({
    maxConcurrentTasks: z.number(),
    maxStorageBytes: z.number(),
    maxApiCallsPerMinute: z.number(),
    maxAgents: z.number()
  }),
  metadata: z.record(z.unknown()).optional()
});

export type Tenant = z.infer<typeof TenantSchema>;
