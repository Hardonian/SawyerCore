import { randomUUID } from 'crypto';
import { ApiKey, Tenant, AgentConfig, Referral, ShareableOutput } from './types.js';

const tenants = new Map<string, Tenant>();
const apiKeys = new Map<string, ApiKey>();
const apiKeyToId = new Map<string, string>();
const tenantByApiKey = new Map<string, string>();
const agentConfigs = new Map<string, AgentConfig>();
const referrals = new Map<string, Referral>();
const shareableOutputs = new Map<string, ShareableOutput>();

// Per-tenant indexes for performance
const tenantApiKeys = new Map<string, Set<string>>();
const tenantAgentConfigs = new Map<string, Set<string>>();

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
    apiKeyToId.set(key, apiKey.id);
    tenantByApiKey.set(key, tenantId);
    
    if (!tenantApiKeys.has(tenantId)) tenantApiKeys.set(tenantId, new Set());
    tenantApiKeys.get(tenantId)!.add(apiKey.id);

    return { key, apiKey };
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const apiKeyId = apiKeyToId.get(key);
    if (!apiKeyId) return null;

    const apiKey = apiKeys.get(apiKeyId);
    if (!apiKey) return null;

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }
    
    apiKey.lastUsedAt = new Date();
    return apiKey;
  }

  async getTenantByApiKey(key: string): Promise<string | null> {
    return tenantByApiKey.get(key) ?? null;
  }

  async revokeApiKey(apiKeyId: string): Promise<void> {
    const apiKey = apiKeys.get(apiKeyId);
    if (apiKey) {
      apiKeyToId.delete(apiKey.key);
      tenantByApiKey.delete(apiKey.key);
      tenantApiKeys.get(apiKey.tenantId)?.delete(apiKeyId);
      apiKeys.delete(apiKeyId);
    }
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    const ids = tenantApiKeys.get(tenantId);
    if (!ids) return [];
    return Array.from(ids).map(id => apiKeys.get(id)!).filter(Boolean);
  }

  async createAgentConfig(config: Omit<AgentConfig, 'id'>): Promise<AgentConfig> {
    const agentConfig: AgentConfig = {
      ...config,
      id: randomUUID()
    };
    agentConfigs.set(agentConfig.id, agentConfig);
    
    if (!tenantAgentConfigs.has(config.tenantId)) tenantAgentConfigs.set(config.tenantId, new Set());
    tenantAgentConfigs.get(config.tenantId)!.add(agentConfig.id);

    return agentConfig;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | null> {
    return agentConfigs.get(id) ?? null;
  }

  async listAgentConfigs(tenantId: string): Promise<AgentConfig[]> {
    const ids = tenantAgentConfigs.get(tenantId);
    if (!ids) return [];
    return Array.from(ids).map(id => agentConfigs.get(id)!).filter(Boolean);
  }

  async updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
    const config = agentConfigs.get(id);
    if (!config) return null;
    const updated = { ...config, ...updates };
    agentConfigs.set(id, updated);
    return updated;
  }

  async deleteAgentConfig(id: string): Promise<boolean> {
    const config = agentConfigs.get(id);
    if (config) {
      tenantAgentConfigs.get(config.tenantId)?.delete(id);
    }
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
    for (const r of referrals.values()) {
      if (r.code === code) return r;
    }
    return null;
  }

  async completeReferral(code: string): Promise<Referral | null> {
    let referral: Referral | null = null;
    for (const r of referrals.values()) {
      if (r.code === code) {
        referral = r;
        break;
      }
    }
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
    const results: ShareableOutput[] = [];
    for (const o of shareableOutputs.values()) {
      if (o.tenantId === tenantId) results.push(o);
    }
    return results;
  }

  async clearTenantData(tenantId: string): Promise<void> {
    tenants.delete(tenantId);
    
    const keyIds = tenantApiKeys.get(tenantId);
    if (keyIds) {
      for (const id of keyIds) {
        const apiKey = apiKeys.get(id);
        if (apiKey) {
          apiKeyToId.delete(apiKey.key);
          tenantByApiKey.delete(apiKey.key);
          apiKeys.delete(id);
        }
      }
      tenantApiKeys.delete(tenantId);
    }

    const agentIds = tenantAgentConfigs.get(tenantId);
    if (agentIds) {
      for (const id of agentIds) {
        agentConfigs.delete(id);
      }
      tenantAgentConfigs.delete(tenantId);
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

