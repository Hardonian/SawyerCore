import { UsageRecord } from './types.js';
export declare class BillingController {
    private usageTracker;
    constructor();
    recordTaskUsage(tenantId: string, runId: string, computeMs: number, tokensUsed: number): Promise<UsageRecord[]>;
    recordAgentRunUsage(tenantId: string, runId: string, durationMs: number, stepsCompleted: number): Promise<UsageRecord>;
    recordApiCall(tenantId: string, runId: string, latencyMs: number): Promise<UsageRecord>;
    calculateCurrentBill(tenantId: string): Promise<{
        baseCost: number;
        usageCost: number;
        totalCost: number;
        breakdown: Record<string, number>;
    }>;
    checkTenantQuota(tenantId: string): Promise<{
        canExecute: boolean;
        reason?: string;
        currentUsage: Record<string, {
            current: number;
            limit?: number;
        }>;
    }>;
    getUsageReport(tenantId: string, startDate: Date, endDate: Date): Promise<{
        totalCost: number;
        records: number;
        breakdown: Record<string, {
            quantity: number;
            cost: number;
        }>;
    }>;
}
