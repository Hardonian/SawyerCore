import { ApiKey, Tenant, AgentConfig, Referral, ShareableOutput } from './types.js';
export declare class TenantManager {
    private static instance;
    static getInstance(): TenantManager;
    createTenant(data: {
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
    }): Promise<Tenant>;
    getTenant(id: string): Promise<Tenant | null>;
    updateTenantStatus(id: string, status: Tenant['status']): Promise<Tenant | null>;
    createApiKey(tenantId: string, name: string, scopes: string[], expiresAt?: Date): Promise<{
        key: string;
        apiKey: ApiKey;
    }>;
    validateApiKey(key: string): Promise<ApiKey | null>;
    getTenantByApiKey(key: string): Promise<string | null>;
    revokeApiKey(apiKeyId: string): Promise<void>;
    listApiKeys(tenantId: string): Promise<ApiKey[]>;
    createAgentConfig(config: Omit<AgentConfig, 'id'>): Promise<AgentConfig>;
    getAgentConfig(id: string): Promise<AgentConfig | null>;
    listAgentConfigs(tenantId: string): Promise<AgentConfig[]>;
    updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null>;
    deleteAgentConfig(id: string): Promise<boolean>;
    createReferral(referrerTenantId: string, referredEmail: string): Promise<Referral>;
    getReferralByCode(code: string): Promise<Referral | null>;
    completeReferral(code: string): Promise<Referral | null>;
    getReferrals(tenantId: string): Promise<Referral[]>;
    createShareableOutput(data: {
        tenantId: string;
        runId: string;
        title: string;
        content: unknown;
        expiresAt?: Date;
        password?: string;
    }): Promise<ShareableOutput>;
    getShareableOutput(id: string): Promise<ShareableOutput | null>;
    getShareableOutputs(tenantId: string): Promise<ShareableOutput[]>;
    clearTenantData(tenantId: string): Promise<void>;
}
