import { UsageRecord, UsageEventType, TenantResourceLimits, BillingPeriod } from './types.js';
export declare class UsageTracker {
    private static instance;
    static getInstance(): UsageTracker;
    recordUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): Promise<UsageRecord>;
    getTenantUsage(tenantId: string, startDate: Date, endDate: Date): Promise<UsageRecord[]>;
    getCurrentPeriodUsage(tenantId: string): Promise<BillingPeriod | null>;
    setResourceLimits(limits: TenantResourceLimits): Promise<void>;
    getResourceLimits(tenantId: string): Promise<TenantResourceLimits | null>;
    createBillingPeriod(tenantId: string, period: BillingPeriod): Promise<void>;
    private enforceLimits;
    private getTenantUsageSync;
    getUsageByType(tenantId: string, eventType: UsageEventType, startDate: Date, endDate: Date): Promise<number>;
    clearTenantData(tenantId: string): Promise<void>;
    static clearAll(): void;
}
