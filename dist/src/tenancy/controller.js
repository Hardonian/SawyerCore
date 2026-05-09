import { randomUUID } from 'crypto';
const rateLimitStore = new Map();
export class TenantIsolationController {
    static instance;
    activeContexts = new Map();
    tenantDataPartitions = new Map();
    defaultRateLimits = {
        windowMs: 60000,
        maxRequests: 100
    };
    static getInstance() {
        if (!TenantIsolationController.instance) {
            TenantIsolationController.instance = new TenantIsolationController();
        }
        return TenantIsolationController.instance;
    }
    async createContext(tenantId, apiKey, scopes, resourceLimits) {
        const context = {
            tenantId,
            apiKey,
            requestId: randomUUID(),
            timestamp: new Date(),
            scopes,
            resourceLimits
        };
        this.activeContexts.set(apiKey, context);
        if (!this.tenantDataPartitions.has(tenantId)) {
            this.tenantDataPartitions.set(tenantId, new Set());
        }
        return context;
    }
    async validateContext(apiKey) {
        const context = this.activeContexts.get(apiKey);
        if (!context)
            return null;
        if (!this.checkRateLimit(context.tenantId)) {
            return null;
        }
        this.recordRequest(context.tenantId);
        return context;
    }
    async enforceIsolation(requestingTenantId, targetResourceId) {
        const partition = this.tenantDataPartitions.get(requestingTenantId);
        if (!partition)
            return false;
        return partition.has(targetResourceId);
    }
    async registerResource(tenantId, resourceId) {
        let partition = this.tenantDataPartitions.get(tenantId);
        if (!partition) {
            partition = new Set();
            this.tenantDataPartitions.set(tenantId, partition);
        }
        partition.add(resourceId);
    }
    async removeResource(tenantId, resourceId) {
        const partition = this.tenantDataPartitions.get(tenantId);
        if (partition) {
            partition.delete(resourceId);
        }
    }
    async revokeContext(apiKey) {
        this.activeContexts.delete(apiKey);
    }
    checkRateLimit(tenantId) {
        const now = Date.now();
        const limit = this.defaultRateLimits;
        const key = tenantId;
        const record = rateLimitStore.get(key);
        if (!record)
            return true;
        if (now > record.resetAt) {
            return true;
        }
        return record.count < limit.maxRequests;
    }
    recordRequest(tenantId) {
        const now = Date.now();
        const limit = this.defaultRateLimits;
        const key = tenantId;
        const record = rateLimitStore.get(key);
        if (!record || now > record.resetAt) {
            rateLimitStore.set(key, {
                count: 1,
                resetAt: now + limit.windowMs
            });
        }
        else {
            record.count++;
        }
    }
    async getTenantContext(apiKey) {
        return this.activeContexts.get(apiKey) ?? null;
    }
    async clearAllContexts() {
        this.activeContexts.clear();
        this.tenantDataPartitions.clear();
        rateLimitStore.clear();
    }
    async getTenantResources(tenantId) {
        return this.tenantDataPartitions.get(tenantId) ?? new Set();
    }
}
