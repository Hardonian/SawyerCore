import { randomUUID } from 'crypto';
import { ApiKey, Tenant, AgentConfig, Referral, ShareableOutput } from './types.js';

const tenants = new Map<string, Tenant>();
const apiKeys = new Map<string, ApiKey>();
const tenantByApiKey = new Map<string, string>();
const agentConfigs = new Map<string, AgentConfig>();
const referrals = new Map<string, Referral>();
const shareableOutputs = new Map<string, ShareableOutput>();

export class TenantManager {
  private static instance: TenantManager;

  static getInstance(): TenantManager {
    if (!TenantManager.instance) {
      TenantManager.instance = new TenantManager();
    }
    return TenantManager.instance;
  }

  async createTenant(data: {
    id: string;
    name: string;
    email: string;
    plan: string;
    resourceLimits: {
      maxConcurrentTasks: number;
      maxStorageBytes: number;
      maxApiCallsPerMinute: number;
      maxAgents: number;
    };
    metadata?: Record<string, unknown>;
  }): Promise<Tenant> {
    const tenant: Tenant = {
      id: data.id,
      name: data.name,
      email: data.email,
      createdAt: new Date(),
      status: 'trial',
      plan: data.plan,
      resourceLimits: data.resourceLimits,
      metadata: data.metadata
    };

    tenants.set(tenant.id, tenant);
    return tenant;
  }

  async getTenant(id: string): Promise<Tenant | null> {
    return tenants.get(id) ?? null;
  }

  async updateTenantStatus(id: string, status: Tenant['status']): Promise<Tenant | null> {
    const tenant = tenants.get(id);
    if (!tenant) return null;
    tenant.status = status;
    tenants.set(id, tenant);
    return tenant;
  }

  async createApiKey(tenantId: string, name: string, scopes: string[], expiresAt?: Date): Promise<{ key: string; apiKey: ApiKey }> {
    const key = `sk_${randomUUID().replace(/-/g, '')}`;
    const apiKey: ApiKey = {
      id: randomUUID(),
      key,
      tenantId,
      name,
      createdAt: new Date(),
      expiresAt,
      scopes,
      rateLimitPerMinute: undefined
    };

    apiKeys.set(apiKey.id, apiKey);
    tenantByApiKey.set(key, tenantId);

    return { key, apiKey };
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const tenantId = tenantByApiKey.get(key);
    if (!tenantId) return null;

    for (const apiKey of apiKeys.values()) {
      if (apiKey.key === key && apiKey.tenantId === tenantId) {
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          return null;
        }
        apiKey.lastUsedAt = new Date();
        apiKeys.set(apiKey.id, apiKey);
        return apiKey;
      }
    }
    return null;
  }

  async getTenantByApiKey(key: string): Promise<string | null> {
    return tenantByApiKey.get(key) ?? null;
  }

  async revokeApiKey(apiKeyId: string): Promise<void> {
    const apiKey = apiKeys.get(apiKeyId);
    if (apiKey) {
      tenantByApiKey.delete(apiKey.key);
      apiKeys.delete(apiKeyId);
    }
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    return Array.from(apiKeys.values()).filter(k => k.tenantId === tenantId);
  }

  async createAgentConfig(config: Omit<AgentConfig, 'id'>): Promise<AgentConfig> {
    const agentConfig: AgentConfig = {
      ...config,
      id: randomUUID()
    };
    agentConfigs.set(agentConfig.id, agentConfig);
    return agentConfig;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | null> {
    return agentConfigs.get(id) ?? null;
  }

  async listAgentConfigs(tenantId: string): Promise<AgentConfig[]> {
    return Array.from(agentConfigs.values()).filter(a => a.tenantId === tenantId);
  }

  async updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
    const config = agentConfigs.get(id);
    if (!config) return null;
    const updated = { ...config, ...updates };
    agentConfigs.set(id, updated);
    return updated;
  }

  async deleteAgentConfig(id: string): Promise<boolean> {
    return agentConfigs.delete(id);
  }

  async createReferral(referrerTenantId: string, referredEmail: string): Promise<Referral> {
    const code = `ref_${randomUUID().substring(0, 8)}`;
    const referral: Referral = {
      id: randomUUID(),
      referrerTenantId,
      referredEmail,
      code,
      status: 'pending',
      createdAt: new Date()
    };
    referrals.set(referral.id, referral);
    return referral;
  }

  async getReferralByCode(code: string): Promise<Referral | null> {
    return Array.from(referrals.values()).find(r => r.code === code) ?? null;
  }

  async completeReferral(code: string): Promise<Referral | null> {
    const referral = Array.from(referrals.values()).find(r => r.code === code);
    if (!referral) return null;
    referral.status = 'completed';
    referral.convertedAt = new Date();
    referrals.set(referral.id, referral);
    return referral;
  }

  async getReferrals(tenantId: string): Promise<Referral[]> {
    return Array.from(referrals.values()).filter(r => r.referrerTenantId === tenantId);
  }

  async createShareableOutput(data: {
    tenantId: string;
    runId: string;
    title: string;
    content: unknown;
    expiresAt?: Date;
    password?: string;
  }): Promise<ShareableOutput> {
    const id = randomUUID();
    const output: ShareableOutput = {
      id,
      tenantId: data.tenantId,
      runId: data.runId,
      title: data.title,
      content: data.content,
      publicUrl: `/share/${id}`,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
      views: 0,
      password: data.password
    };
    shareableOutputs.set(id, output);
    return output;
  }

  async getShareableOutput(id: string): Promise<ShareableOutput | null> {
    const output = shareableOutputs.get(id);
    if (!output) return null;
    if (output.expiresAt && output.expiresAt < new Date()) {
      return null;
    }
    output.views++;
    shareableOutputs.set(id, output);
    return output;
  }

  async getShareableOutputs(tenantId: string): Promise<ShareableOutput[]> {
    return Array.from(shareableOutputs.values()).filter(o => o.tenantId === tenantId);
  }

  async clearTenantData(tenantId: string): Promise<void> {
    tenants.delete(tenantId);
    for (const [key, apiKey] of apiKeys.entries()) {
      if (apiKey.tenantId === tenantId) {
        apiKeys.delete(key);
        tenantByApiKey.delete(apiKey.key);
      }
    }
    for (const [key, config] of agentConfigs.entries()) {
      if (config.tenantId === tenantId) {
        agentConfigs.delete(key);
      }
    }
    for (const [key, referral] of referrals.entries()) {
      if (referral.referrerTenantId === tenantId) {
        referrals.delete(key);
      }
    }
    for (const [key, output] of shareableOutputs.entries()) {
      if (output.tenantId === tenantId) {
        shareableOutputs.delete(key);
      }
    }
  }
}
