import { describe, it, expect, beforeEach } from 'vitest';
import { BillingController } from '../../src/billing/controller';
import { UsageTracker } from '../../src/billing/usage-tracker';
import { PricingCatalog } from '../../src/billing/pricing';

describe('Billing System', () => {
  let billing: BillingController;
  let usageTracker: UsageTracker;

  beforeEach(() => {
    billing = new BillingController();
    usageTracker = UsageTracker.getInstance();
    PricingCatalog.assignTier('test-tenant', 'starter');
    PricingCatalog.assignTier('test-tenant-2', 'pro');
  });

  describe('Task Usage Recording', () => {
    it('records task usage with correct metadata', async () => {
      const records = await billing.recordTaskUsage(
        'test-tenant',
        'run-123',
        5000,
        1500
      );

      expect(records).toHaveLength(2);
      expect(records[0].eventType).toBe('task');
      expect(records[0].quantity).toBe(1);
      expect(records[0].runId).toBe('run-123');
      expect(records[0].metadata).toEqual({ computeMs: 5000, tokensUsed: 1500 });

      expect(records[1].eventType).toBe('compute');
      expect(records[1].quantity).toBeCloseTo(5000 / 60000, 5);
      expect(records[1].runId).toBe('run-123');
    });

    it('records agent run usage correctly', async () => {
      const record = await billing.recordAgentRunUsage(
        'test-tenant',
        'agent-run-456',
        120000,
        5
      );

      expect(record.eventType).toBe('agent_run');
      expect(record.quantity).toBe(1);
      expect(record.runId).toBe('agent-run-456');
      expect(record.metadata).toEqual({ durationMs: 120000, stepsCompleted: 5 });
    });

    it('records API call usage correctly', async () => {
      const record = await billing.recordApiCall(
        'test-tenant',
        'api-call-789',
        250
      );

      expect(record.eventType).toBe('api_call');
      expect(record.quantity).toBe(1);
      expect(record.metadata).toEqual({ latencyMs: 250 });
    });
  });

  describe('Billing Calculation', () => {
    it('calculates current bill with correct rates', async () => {
      await billing.recordTaskUsage('test-tenant', 'run-1', 3000, 800);
      await billing.recordAgentRunUsage('test-tenant', 'agent-1', 60000, 3);

      const bill = await billing.calculateCurrentBill('test-tenant');

      expect(bill.baseCost).toBe(29);
      expect(bill.usageCost).toBeGreaterThan(0);
      expect(bill.totalCost).toBe(bill.baseCost + bill.usageCost);
      expect(bill.breakdown).toHaveProperty('task');
      expect(bill.breakdown).toHaveProperty('compute');
      expect(bill.breakdown).toHaveProperty('agent_run');
    });

    it('matches usage exactly without rounding errors', async () => {
      const quantity = 100;
      for (let i = 0; i < quantity; i++) {
        await billing.recordTaskUsage('test-tenant', `run-${i}`, 1000, 100);
      }

      const bill = await billing.calculateCurrentBill('test-tenant');
      const taskCost = bill.breakdown['task'] ?? 0;
      const expectedTaskCost = quantity * 0.01;

      expect(taskCost).toBeCloseTo(expectedTaskCost, 2);
    });

    it('returns zero bill for tenant with no usage', async () => {
      const bill = await billing.calculateCurrentBill('new-tenant');

      expect(bill.baseCost).toBe(0);
      expect(bill.usageCost).toBe(0);
      expect(bill.totalCost).toBe(0);
    });
  });

  describe('Quota Enforcement', () => {
    it('allows execution within quota', async () => {
      const quota = await billing.checkTenantQuota('test-tenant');

      expect(quota.canExecute).toBe(true);
      expect(quota.reason).toBeUndefined();
      expect(quota.currentUsage).toHaveProperty('task');
      expect(quota.currentUsage).toHaveProperty('compute');
      expect(quota.currentUsage).toHaveProperty('agent_run');
    });

    it('tracks current usage correctly', async () => {
      await billing.recordTaskUsage('test-tenant', 'run-1', 1000, 100);
      await billing.recordTaskUsage('test-tenant', 'run-2', 1000, 100);
      await billing.recordTaskUsage('test-tenant', 'run-3', 1000, 100);

      const quota = await billing.checkTenantQuota('test-tenant');

      expect(quota.currentUsage.task.current).toBe(3);
      expect(quota.currentUsage.compute.current).toBeGreaterThan(0);
    });

    it('reports quota exceeded when limit reached', async () => {
      PricingCatalog.assignTier('quota-test', 'free');
      for (let i = 0; i < 110; i++) {
        await billing.recordTaskUsage('quota-test', `run-${i}`, 1000, 100);
      }

      const quota = await billing.checkTenantQuota('quota-test');

      expect(quota.canExecute).toBe(false);
      expect(quota.reason).toContain('Quota exceeded');
    });
  });

  describe('Usage Reports', () => {
    it('generates accurate usage reports', async () => {
      await billing.recordTaskUsage('test-tenant', 'run-1', 1000, 100);
      await billing.recordAgentRunUsage('test-tenant', 'agent-1', 60000, 3);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const report = await billing.getUsageReport('test-tenant', monthStart, monthEnd);

      expect(report.records).toBeGreaterThanOrEqual(2);
      expect(report.breakdown).toHaveProperty('task');
      expect(report.breakdown).toHaveProperty('compute');
      expect(report.breakdown).toHaveProperty('agent_run');
      expect(report.totalCost).toBeGreaterThan(0);
    });

    it('filters usage by date range', async () => {
      await billing.recordTaskUsage('test-tenant', 'run-1', 1000, 100);

      const now = new Date();
      const pastStart = new Date(now.getFullYear() - 1, 0, 1);
      const pastEnd = new Date(now.getFullYear() - 1, 11, 31);

      const report = await billing.getUsageReport('test-tenant', pastStart, pastEnd);

      expect(report.records).toBe(0);
      expect(report.totalCost).toBe(0);
    });
  });
});
