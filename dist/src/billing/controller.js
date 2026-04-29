import { UsageTracker } from './usage-tracker.js';
import { PricingCatalog } from './pricing.js';
export class BillingController {
    usageTracker;
    constructor() {
        this.usageTracker = UsageTracker.getInstance();
    }
    async recordTaskUsage(tenantId, runId, computeMs, tokensUsed) {
        const records = [];
        const taskRecord = await this.usageTracker.recordUsage({
            tenantId,
            eventType: 'task',
            quantity: 1,
            unit: 'task',
            runId,
            metadata: { computeMs, tokensUsed }
        });
        records.push(taskRecord);
        const computeMinutes = computeMs / 60000;
        const computeRecord = await this.usageTracker.recordUsage({
            tenantId,
            eventType: 'compute',
            quantity: computeMinutes,
            unit: 'minutes',
            runId
        });
        records.push(computeRecord);
        return records;
    }
    async recordAgentRunUsage(tenantId, runId, durationMs, stepsCompleted) {
        return await this.usageTracker.recordUsage({
            tenantId,
            eventType: 'agent_run',
            quantity: 1,
            unit: 'run',
            runId,
            metadata: { durationMs, stepsCompleted }
        });
    }
    async recordApiCall(tenantId, runId, latencyMs) {
        return await this.usageTracker.recordUsage({
            tenantId,
            eventType: 'api_call',
            quantity: 1,
            unit: 'call',
            runId,
            metadata: { latencyMs }
        });
    }
    async calculateCurrentBill(tenantId) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const records = await this.usageTracker.getTenantUsage(tenantId, monthStart, monthEnd);
        const breakdown = {};
        let usageCost = 0;
        for (const record of records) {
            const cost = PricingCatalog.calculateCost(tenantId, record.eventType, record.quantity);
            breakdown[record.eventType] = (breakdown[record.eventType] ?? 0) + cost;
            usageCost += cost;
        }
        const tier = PricingCatalog.getTierForTenant(tenantId);
        const baseCost = tier?.basePriceUsd ?? 0;
        return {
            baseCost,
            usageCost,
            totalCost: baseCost + usageCost,
            breakdown
        };
    }
    async checkTenantQuota(tenantId) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const tier = PricingCatalog.getTierForTenant(tenantId);
        if (!tier?.limits) {
            return { canExecute: true, currentUsage: {} };
        }
        const currentUsage = {};
        const taskCount = await this.usageTracker.getUsageByType(tenantId, 'task', monthStart, monthEnd);
        currentUsage.task = {
            current: taskCount,
            limit: tier.limits.maxTasksPerMonth
        };
        const computeMinutes = await this.usageTracker.getUsageByType(tenantId, 'compute', monthStart, monthEnd);
        currentUsage.compute = {
            current: computeMinutes,
            limit: tier.limits.maxComputeMinutesPerMonth
        };
        const agentRuns = await this.usageTracker.getUsageByType(tenantId, 'agent_run', monthStart, monthEnd);
        currentUsage.agent_run = {
            current: agentRuns,
            limit: tier.limits.maxAgentRunsPerMonth
        };
        const canExecute = Object.entries(currentUsage).every(([_key, value]) => !value.limit || value.current < value.limit);
        let reason;
        if (!canExecute) {
            const exceeded = Object.entries(currentUsage)
                .filter(([, value]) => value.limit && value.current >= value.limit)
                .map(([key]) => key);
            reason = `Quota exceeded for: ${exceeded.join(', ')}`;
        }
        return { canExecute, reason, currentUsage };
    }
    async getUsageReport(tenantId, startDate, endDate) {
        const records = await this.usageTracker.getTenantUsage(tenantId, startDate, endDate);
        const breakdown = {};
        let totalCost = 0;
        for (const record of records) {
            const cost = PricingCatalog.calculateCost(tenantId, record.eventType, record.quantity);
            if (!breakdown[record.eventType]) {
                breakdown[record.eventType] = { quantity: 0, cost: 0 };
            }
            breakdown[record.eventType].quantity += record.quantity;
            breakdown[record.eventType].cost += cost;
            totalCost += cost;
        }
        return {
            totalCost,
            records: records.length,
            breakdown
        };
    }
}
