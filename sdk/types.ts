/**
 * SawyerCore SDK Type Definitions
 * Enterprise-grade interfaces for tasks, agents, shares, API keys, and multi-tenant operations.
 */

export type TaskType = 'chat' | 'completion' | 'embedding' | 'classification' | 'summarization';

export type TaskPrivacy = 'public' | 'private' | 'sensitive';

export type DegradedState = 'NOMINAL' | 'MODEL_UNAVAILABLE' | 'LOW_MEMORY' | 'PARTIAL_EXECUTION';

export interface TaskInput {
  type: TaskType;
  input: string;
  model?: string;
  parameters?: Record<string, unknown>;
  privacy?: TaskPrivacy;
}

export interface TaskResult<T = unknown> {
  id: string;
  tenantId: string;
  runId: string;
  output: T;
  provider: string;
  latencyMs: number;
  costUsd: number;
  tokensUsed?: number;
  degradedState: DegradedState;
  timestamp: string | Date;
}

export interface ProviderInfo {
  name: string;
  tier: 'LOCAL_TINY' | 'LOCAL_BALANCED' | 'LOCAL_QUALITY' | 'CLOUD_FALLBACK';
  modelId: string;
  contextWindow: number;
  costPer1kTokens: number;
  available: boolean;
  latencyMs?: number;
}

export interface EngineStatus {
  status: 'healthy' | 'degraded' | 'offline';
  activeProfile: string;
  hardware: {
    cpuCores: number;
    availableMemory: number;
    gpuAvailable: boolean;
  };
  providers: ProviderInfo[];
  uptimeSeconds?: number;
}

export interface ApiKey {
  id: string;
  key?: string;
  tenantId: string;
  name: string;
  createdAt: string | Date;
  expiresAt?: string | Date;
  lastUsedAt?: string | Date;
  scopes: string[];
  rateLimitPerMinute?: number;
}

export interface CreateApiKeyOptions {
  name: string;
  scopes: string[];
  expiresAt?: Date | string;
}

export interface AgentStep {
  type: string;
  config: Record<string, unknown>;
}

export interface AgentConfig {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  steps: AgentStep[];
  triggers: ('manual' | 'schedule' | 'webhook')[];
  enabled: boolean;
}

export interface CreateAgentOptions {
  name: string;
  description?: string;
  steps: AgentStep[];
  triggers: ('manual' | 'schedule' | 'webhook')[];
  enabled?: boolean;
}

export interface ShareableOutput {
  id: string;
  tenantId: string;
  runId: string;
  title: string;
  content: unknown;
  publicUrl: string;
  createdAt: string | Date;
  expiresAt?: string | Date;
  views: number;
  password?: string;
}

export interface CreateShareOptions {
  runId: string;
  title: string;
  content: unknown;
  expiresAt?: Date | string;
  password?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  email: string;
  createdAt: string | Date;
  status: 'active' | 'suspended' | 'trial' | 'past_due';
  plan: string;
  resourceLimits: {
    maxConcurrentTasks: number;
    maxStorageBytes: number;
    maxApiCallsPerMinute: number;
    maxAgents: number;
  };
  metadata?: Record<string, unknown>;
}

export interface TenantQuota {
  canExecute: boolean;
  reason?: string;
  currentTasks?: number;
  maxTasks?: number;
}

export interface CurrentBill {
  tenantId: string;
  periodStart: string | Date;
  periodEnd: string | Date;
  baseAmountUsd: number;
  usageAmountUsd: number;
  totalAmountUsd: number;
  lineItems: {
    description: string;
    quantity: number;
    unitPriceUsd: number;
    totalUsd: number;
  }[];
}

export interface MeResponse {
  tenant: TenantInfo;
  quota: TenantQuota;
  billing: CurrentBill;
}

export interface SawyerClientOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface PluginContext {
  id: string;
  version: string;
  permissions: string[];
}

export interface Capability {
  name: string;
  description: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}
