import { randomUUID } from 'crypto';
const tenants = new Map();
const apiKeys = new Map();
const apiKeyToId = new Map();
const tenantByApiKey = new Map();
const agentConfigs = new Map();
const referrals = new Map();
const shareableOutputs = new Map();
// Per-tenant indexes for performance
const tenantApiKeys = new Map();
const tenantAgentConfigs = new Map();
export class TenantManager {
    static instance;
    static getInstance() {
        if (!TenantManager.instance) {
            TenantManager.instance = new TenantManager();
        }
        return TenantManager.instance;
    }
    async createTenant(data) {
        const tenant = {
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
    async getTenant(id) {
        return tenants.get(id) ?? null;
    }
    async updateTenantStatus(id, status) {
        const tenant = tenants.get(id);
        if (!tenant)
            return null;
        tenant.status = status;
        tenants.set(id, tenant);
        return tenant;
    }
    async createApiKey(tenantId, name, scopes, expiresAt) {
        const key = `sk_${randomUUID().replace(/-/g, '')}`;
        const apiKey = {
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
        if (!tenantApiKeys.has(tenantId))
            tenantApiKeys.set(tenantId, new Set());
        tenantApiKeys.get(tenantId).add(apiKey.id);
        return { key, apiKey };
    }
    async validateApiKey(key) {
        const apiKeyId = apiKeyToId.get(key);
        if (!apiKeyId)
            return null;
        const apiKey = apiKeys.get(apiKeyId);
        if (!apiKey)
            return null;
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
            return null;
        }
        apiKey.lastUsedAt = new Date();
        return apiKey;
    }
    async getTenantByApiKey(key) {
        return tenantByApiKey.get(key) ?? null;
    }
    async revokeApiKey(apiKeyId) {
        const apiKey = apiKeys.get(apiKeyId);
        if (apiKey) {
            apiKeyToId.delete(apiKey.key);
            tenantByApiKey.delete(apiKey.key);
            tenantApiKeys.get(apiKey.tenantId)?.delete(apiKeyId);
            apiKeys.delete(apiKeyId);
        }
    }
    async listApiKeys(tenantId) {
        const ids = tenantApiKeys.get(tenantId);
        if (!ids)
            return [];
        return Array.from(ids).map(id => apiKeys.get(id)).filter(Boolean);
    }
    async createAgentConfig(config) {
        const agentConfig = {
            ...config,
            id: randomUUID()
        };
        agentConfigs.set(agentConfig.id, agentConfig);
        if (!tenantAgentConfigs.has(config.tenantId))
            tenantAgentConfigs.set(config.tenantId, new Set());
        tenantAgentConfigs.get(config.tenantId).add(agentConfig.id);
        return agentConfig;
    }
    async getAgentConfig(id) {
        return agentConfigs.get(id) ?? null;
    }
    async listAgentConfigs(tenantId) {
        const ids = tenantAgentConfigs.get(tenantId);
        if (!ids)
            return [];
        return Array.from(ids).map(id => agentConfigs.get(id)).filter(Boolean);
    }
    async updateAgentConfig(id, updates) {
        const config = agentConfigs.get(id);
        if (!config)
            return null;
        const updated = { ...config, ...updates };
        agentConfigs.set(id, updated);
        return updated;
    }
    async deleteAgentConfig(id) {
        const config = agentConfigs.get(id);
        if (config) {
            tenantAgentConfigs.get(config.tenantId)?.delete(id);
        }
        return agentConfigs.delete(id);
    }
    async createReferral(referrerTenantId, referredEmail) {
        const code = `ref_${randomUUID().substring(0, 8)}`;
        const referral = {
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
    async getReferralByCode(code) {
        for (const r of referrals.values()) {
            if (r.code === code)
                return r;
        }
        return null;
    }
    async completeReferral(code) {
        let referral = null;
        for (const r of referrals.values()) {
            if (r.code === code) {
                referral = r;
                break;
            }
        }
        if (!referral)
            return null;
        referral.status = 'completed';
        referral.convertedAt = new Date();
        referrals.set(referral.id, referral);
        return referral;
    }
    async getReferrals(tenantId) {
        return Array.from(referrals.values()).filter(r => r.referrerTenantId === tenantId);
    }
    async createShareableOutput(data) {
        const id = randomUUID();
        const output = {
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
    async getShareableOutput(id) {
        const output = shareableOutputs.get(id);
        if (!output)
            return null;
        if (output.expiresAt && output.expiresAt < new Date()) {
            return null;
        }
        output.views++;
        shareableOutputs.set(id, output);
        return output;
    }
    async getShareableOutputs(tenantId) {
        const results = [];
        for (const o of shareableOutputs.values()) {
            if (o.tenantId === tenantId)
                results.push(o);
        }
        return results;
    }
    async clearTenantData(tenantId) {
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
