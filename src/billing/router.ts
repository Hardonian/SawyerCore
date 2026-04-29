import { Request, Response, Router } from 'express';
import { BillingController } from './controller.js';
import { createCustomer, createSubscription, cancelSubscription, updateSubscription, generatePaymentLink, initStripe, reportUsageToMeter, createInvoice } from './stripe.js';
import { UsageTracker } from './usage-tracker.js';
import { PricingCatalog } from './pricing.js';
import { TenantResourceLimitsSchema } from './types.js';

export function createBillingRouter(): Router {
  const router = Router();
  const billing = new BillingController();
  const usageTracker = UsageTracker.getInstance();

  if (process.env.STRIPE_SECRET_KEY) {
    initStripe(process.env.STRIPE_SECRET_KEY);
  }

  router.post('/customers', async (req, res) => {
    try {
      const { tenantId, email, metadata } = req.body;
      const customer = await createCustomer(tenantId, email, metadata);
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/subscriptions', async (req, res) => {
    try {
      const { stripeCustomerId, priceId, trialDays } = req.body;
      const subscription = await createSubscription(stripeCustomerId, priceId, trialDays);
      res.json(subscription);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/subscriptions/:id/cancel', async (req, res) => {
    try {
      await cancelSubscription(req.params.id);
      res.json({ canceled: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/subscriptions/:id/update', async (req, res) => {
    try {
      const { priceId } = req.body;
      await updateSubscription(req.params.id, priceId);
      res.json({ updated: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/usage/:tenantId', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
      
      const usage = await usageTracker.getTenantUsage(tenantId, startDate, endDate);
      res.json(usage);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/usage', async (req, res) => {
    try {
      const record = await usageTracker.recordUsage(req.body);
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/billing/:tenantId', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const bill = await billing.calculateCurrentBill(tenantId);
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/quota/:tenantId', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const quota = await billing.checkTenantQuota(tenantId);
      res.json(quota);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/pricing', (_req, res) => {
    res.json(PricingCatalog.getAllTiers());
  });

  router.post('/pricing/:tierName/assign', (req, res) => {
    try {
      const { tenantId } = req.body;
      PricingCatalog.assignTier(tenantId, req.params.tierName);
      res.json({ assigned: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/payment-link', (req, res) => {
    try {
      const { priceId, tenantId, ref } = req.query;
      if (!priceId || !tenantId) {
        res.status(400).json({ error: 'priceId and tenantId required' });
        return;
      }
      const link = generatePaymentLink(priceId as string, tenantId as string, ref as string | undefined);
      res.json({ url: link });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/report/:tenantId', async (req, res) => {
    try {
      const { tenantId } = req.params;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      
      const report = await billing.getUsageReport(tenantId, startDate, endDate);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/limits', async (req, res) => {
    try {
      const limits = TenantResourceLimitsSchema.parse(req.body);
      await usageTracker.setResourceLimits(limits);
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/limits/:tenantId', async (req, res) => {
    try {
      const limits = await usageTracker.getResourceLimits(req.params.tenantId);
      if (!limits) {
        res.status(404).json({ error: 'Limits not found' });
        return;
      }
      res.json(limits);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/webhook', (_req, res) => {
    // Webhook implementation pending
    res.json({ received: true });
  });

  return router;
}
