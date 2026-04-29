import { randomUUID } from 'crypto';
const tenants = new Map();
const apiKeys = new Map();
const tenantByApiKey = new Map();
const agentConfigs = new Map();
const referrals = new Map();
const shareableOutputs = new Map();
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
        tenantByApiKey.set(key, tenantId);
        return { key, apiKey };
    }
    async validateApiKey(key) {
        const tenantId = tenantByApiKey.get(key);
        if (!tenantId)
            return null;
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
    async getTenantByApiKey(key) {
        return tenantByApiKey.get(key) ?? null;
    }
    async revokeApiKey(apiKeyId) {
        const apiKey = apiKeys.get(apiKeyId);
        if (apiKey) {
            tenantByApiKey.delete(apiKey.key);
            apiKeys.delete(apiKeyId);
        }
    }
    async listApiKeys(tenantId) {
        return Array.from(apiKeys.values()).filter(k => k.tenantId === tenantId);
    }
    async createAgentConfig(config) {
        const agentConfig = {
            ...config,
            id: randomUUID()
        };
        agentConfigs.set(agentConfig.id, agentConfig);
        return agentConfig;
    }
    async getAgentConfig(id) {
        return agentConfigs.get(id) ?? null;
    }
    async listAgentConfigs(tenantId) {
        return Array.from(agentConfigs.values()).filter(a => a.tenantId === tenantId);
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
