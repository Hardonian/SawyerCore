import { randomUUID } from 'crypto';
import { UsageRecord, UsageEventType, TenantResourceLimits, BillingPeriod } from './types.js';

const usageStore = new Map<string, UsageRecord[]>();
const resourceLimits = new Map<string, TenantResourceLimits>();
const billingPeriods = new Map<string, BillingPeriod>();

export class UsageTracker {
  private static instance: UsageTracker;

  static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }

  async recordUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): Promise<UsageRecord> {
    const fullRecord: UsageRecord = {
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

  async getTenantUsage(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageRecord[]> {
    const records = usageStore.get(tenantId) ?? [];
    return records.filter(r => 
      r.timestamp >= startDate && r.timestamp <= endDate
    );
  }

  async getCurrentPeriodUsage(tenantId: string): Promise<BillingPeriod | null> {
    return billingPeriods.get(tenantId) ?? null;
  }

  async setResourceLimits(limits: TenantResourceLimits): Promise<void> {
    resourceLimits.set(limits.tenantId, limits);
  }

  async getResourceLimits(tenantId: string): Promise<TenantResourceLimits | null> {
    return resourceLimits.get(tenantId) ?? null;
  }

  async createBillingPeriod(tenantId: string, period: BillingPeriod): Promise<void> {
    billingPeriods.set(tenantId, period);
  }

  private enforceLimits(tenantId: string): void {
    const limits = resourceLimits.get(tenantId);
    if (!limits) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyUsage = this.getTenantUsageSync(tenantId, monthStart, monthEnd);
    
    const taskCount = monthlyUsage.filter(r => r.eventType === 'task').length;
    const limitsDef = limits;
    const maxTasks = limitsDef.maxConcurrentTasks * 1000;

    if (taskCount > maxTasks) {
      throw new Error(
        `Tenant ${tenantId} exceeded task limit: ${taskCount}/${maxTasks}`
      );
    }
  }

  private getTenantUsageSync(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): UsageRecord[] {
    const records = usageStore.get(tenantId) ?? [];
    return records.filter(r =>
      r.timestamp >= startDate && r.timestamp <= endDate
    );
  }

  async getUsageByType(
    tenantId: string,
    eventType: UsageEventType,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const records = await this.getTenantUsage(tenantId, startDate, endDate);
    return records
      .filter(r => r.eventType === eventType)
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  async clearTenantData(tenantId: string): Promise<void> {
    usageStore.delete(tenantId);
    resourceLimits.delete(tenantId);
    billingPeriods.delete(tenantId);
  }

  static clearAll(): void {
    usageStore.clear();
    resourceLimits.clear();
    billingPeriods.clear();
  }
}
