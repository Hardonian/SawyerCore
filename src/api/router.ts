import { Router, Request, Response, NextFunction } from 'express';
import { TenantManager } from './tenant-manager.js';
import { runTask, getEngineStatus, getAvailableProviders } from './runtime.js';
import { BillingController } from '../billing/controller.js';
import { TaskInputSchema, AuthenticatedRequest } from './types.js';

function tenantGuard(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  TenantManager.getInstance()
    .validateApiKey(apiKey)
    .then(apiKeyData => {
      if (!apiKeyData) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      const quota = new BillingController().checkTenantQuota(apiKeyData.tenantId);
      quota.then(quotaResult => {
        if (!quotaResult.canExecute) {
          res.status(429).json({ error: 'Quota exceeded', details: quotaResult.reason });
          return;
        }
        (req as any).tenantId = apiKeyData.tenantId;
        (req as any).apiKey = apiKeyData;
        next();
      });
    })
    .catch((err: any) => {
      res.status(500).json({ error: err.message });
    });
}

export function createApiRouter(): Router {
  const router = Router();
  const tenantManager = TenantManager.getInstance();
  const billing = new BillingController();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.post('/tasks', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const validated = TaskInputSchema.parse(req.body);

      const result = await runTask(tenantId, validated);

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/providers', tenantGuard, async (_req, res) => {
    try {
      const providers = await getAvailableProviders();
      res.json({ providers });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/status', tenantGuard, async (_req, res) => {
    try {
      const status = await getEngineStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/me', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const tenant = await tenantManager.getTenant(tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }
      const quota = await billing.checkTenantQuota(tenantId);
      const currentBill = await billing.calculateCurrentBill(tenantId);
      
      res.json({
        tenant,
        quota,
        billing: currentBill
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/api-keys', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { name, scopes, expiresAt } = req.body;
      if (!name || !scopes) {
        res.status(400).json({ error: 'name and scopes required' });
        return;
      }
      const { key, apiKey } = await tenantManager.createApiKey(
        tenantId,
        name,
        scopes,
        expiresAt ? new Date(expiresAt) : undefined
      );
      res.status(201).json({ key, apiKey });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/api-keys', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const keys = await tenantManager.listApiKeys(tenantId);
      res.json(keys.map((k: any) => ({ ...k, key: '***' })));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/api-keys/:id', tenantGuard, async (req, res) => {
    try {
      await tenantManager.revokeApiKey(req.params.id as string);
      res.json({ revoked: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/agents', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const config = await tenantManager.createAgentConfig({
        ...req.body,
        tenantId
      });
      res.status(201).json(config);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/agents', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const configs = await tenantManager.listAgentConfigs(tenantId);
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/agents/:id', tenantGuard, async (req, res) => {
    try {
      const config = await tenantManager.getAgentConfig(req.params.id as string);
      if (!config) {
        res.status(404).json({ error: 'Agent config not found' });
        return;
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.patch('/agents/:id', tenantGuard, async (req, res) => {
    try {
      const config = await tenantManager.updateAgentConfig(req.params.id as string, req.body);
      if (!config) {
        res.status(404).json({ error: 'Agent config not found' });
        return;
      }
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete('/agents/:id', tenantGuard, async (req, res) => {
    try {
      const deleted = await tenantManager.deleteAgentConfig(req.params.id as string);
      if (!deleted) {
        res.status(404).json({ error: 'Agent config not found' });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/share', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { runId, title, content, expiresAt, password } = req.body;
      const output = await tenantManager.createShareableOutput({
        tenantId,
        runId,
        title,
        content,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        password
      });
      res.status(201).json(output);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/share/:id', async (req, res) => {
    try {
      const output = await tenantManager.getShareableOutput(req.params.id as string);
      if (!output) {
        res.status(404).json({ error: 'Shareable output not found or expired' });
        return;
      }
      
      if (output.password) {
        const providedPassword = req.headers['x-share-password'] as string;
        if (providedPassword !== output.password) {
          res.status(403).json({ error: 'Invalid password' });
          return;
        }
      }
      
      res.json(output);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/my-shares', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const outputs = await tenantManager.getShareableOutputs(tenantId);
      res.json(outputs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/referrals', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: 'email required' });
        return;
      }
      const referral = await tenantManager.createReferral(tenantId, email);
      res.status(201).json(referral);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/referrals', tenantGuard, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const referrals = await tenantManager.getReferrals(tenantId);
      res.json(referrals);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/referrals/claim', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ error: 'referral code required' });
        return;
      }
      const referral = await tenantManager.getReferralByCode(code);
      if (!referral) {
        res.status(404).json({ error: 'Referral code not found' });
        return;
      }
      if (referral.status !== 'pending') {
        res.status(400).json({ error: 'Referral already used or expired' });
        return;
      }
      const completed = await tenantManager.completeReferral(code);
      res.json(completed);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
