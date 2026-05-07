import { randomUUID } from 'crypto';
const usageStore = new Map();
const resourceLimits = new Map();
const billingPeriods = new Map();
export class UsageTracker {
    static instance;
    static getInstance() {
        if (!UsageTracker.instance) {
            UsageTracker.instance = new UsageTracker();
        }
        return UsageTracker.instance;
    }
    async recordUsage(record) {
        const fullRecord = {
            ...record,
            id: randomUUID(),
            timestamp: new Date()
        };
        const tenantRecords = usageStore.get(record.tenantId) ?? [];
        tenantRecords.push(fullRecord);
        usageStore.set(record.tenantId, tenantRecords);
        const limits = resourceLimits.get(record.tenantId);
        if (limits) {
            this.enforceLimits(record.tenantId);
        }
        return fullRecord;
    }
    async getTenantUsage(tenantId, startDate, endDate) {
        const records = usageStore.get(tenantId) ?? [];
        return records.filter(r => r.timestamp >= startDate && r.timestamp <= endDate);
    }
    async getCurrentPeriodUsage(tenantId) {
        return billingPeriods.get(tenantId) ?? null;
    }
    async setResourceLimits(limits) {
        resourceLimits.set(limits.tenantId, limits);
    }
    async getResourceLimits(tenantId) {
        return resourceLimits.get(tenantId) ?? null;
    }
    async createBillingPeriod(tenantId, period) {
        billingPeriods.set(tenantId, period);
    }
    enforceLimits(tenantId) {
        const limits = resourceLimits.get(tenantId);
        if (!limits)
            return;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthlyUsage = this.getTenantUsageSync(tenantId, monthStart, monthEnd);
        const taskCount = monthlyUsage.filter(r => r.eventType === 'task').length;
        const limitsDef = limits;
        const maxTasks = limitsDef.maxConcurrentTasks * 1000;
        if (taskCount > maxTasks) {
            throw new Error(`Tenant ${tenantId} exceeded task limit: ${taskCount}/${maxTasks}`);
        }
    }
    getTenantUsageSync(tenantId, startDate, endDate) {
        const records = usageStore.get(tenantId) ?? [];
        return records.filter(r => r.timestamp >= startDate && r.timestamp <= endDate);
    }
    async getUsageByType(tenantId, eventType, startDate, endDate) {
        const records = await this.getTenantUsage(tenantId, startDate, endDate);
        return records
            .filter(r => r.eventType === eventType)
            .reduce((sum, r) => sum + r.quantity, 0);
    }
    async clearTenantData(tenantId) {
        usageStore.delete(tenantId);
        resourceLimits.delete(tenantId);
        billingPeriods.delete(tenantId);
    }
    static clearAll() {
        usageStore.clear();
        resourceLimits.clear();
        billingPeriods.clear();
    }
}
