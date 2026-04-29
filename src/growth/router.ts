import { Router } from 'express';
import { GrowthEngine } from './engine';

export function createGrowthRouter(): Router {
  const router = Router();
  const growth = GrowthEngine.getInstance();

  router.post('/pages', async (req, res) => {
    try {
      const { slug, title, content, metaDescription, variant } = req.body;
      if (!slug || !title || !content) {
        res.status(400).json({ error: 'slug, title, and content required' });
        return;
      }
      const page = await growth.createLandingPage({
        slug,
        title,
        content,
        metaDescription,
        variant
      });
      res.status(201).json(page);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/pages/:slug', async (req, res) => {
    try {
      const page = await growth.getLandingPageBySlug(req.params.slug);
      if (!page) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      await growth.recordPageView(page.slug);
      res.json(page);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/pages/:slug/convert', async (req, res) => {
    try {
      await growth.recordConversion(req.params.slug);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.patch('/pages/:id', async (req, res) => {
    try {
      const page = await growth.updateLandingPage(req.params.id, req.body);
      if (!page) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      res.json(page);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post('/ab-tests', async (req, res) => {
    try {
      const { name, description, variants, endDate } = req.body;
      if (!name || !variants || variants.length < 2) {
        res.status(400).json({ error: 'name and at least 2 variants required' });
        return;
      }
      const test = await growth.createABTest({
        name,
        description,
        variants,
        endDate: endDate ? new Date(endDate) : undefined
      });
      res.status(201).json(test);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/ab-tests/:testId/assign', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: 'userId required' });
        return;
      }
      const variant = await growth.assignVariant(req.params.testId, userId);
      res.json({ variant });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/ab-tests/:testId/convert', async (req, res) => {
    try {
      const { variantName } = req.body;
      if (!variantName) {
        res.status(400).json({ error: 'variantName required' });
        return;
      }
      await growth.recordABTestConversion(req.params.testId, variantName);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/ab-tests/:testId/winner', async (req, res) => {
    try {
      const test = await growth.declareWinner(req.params.testId);
      if (!test) {
        res.status(404).json({ error: 'Test not found' });
        return;
      }
      res.json(test);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/ab-tests/:testId/results', async (req, res) => {
    try {
      const results = await growth.getABTestResults(req.params.testId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/ab-tests', async (_req, res) => {
    try {
      const tests = await growth.getAllABTests();
      res.json(tests);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/campaigns', async (req, res) => {
    try {
      const { name, type, content, targetAudience, scheduledAt } = req.body;
      if (!name || !type || !content) {
        res.status(400).json({ error: 'name, type, and content required' });
        return;
      }
      const campaign = await growth.createCampaign({
        name,
        type,
        content,
        targetAudience,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined
      });
      res.status(201).json(campaign);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/campaigns/:id/activate', async (req, res) => {
    try {
      const campaign = await growth.activateCampaign(req.params.id);
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/campaigns/:id/metrics', async (req, res) => {
    try {
      const campaign = await growth.recordCampaignMetrics(req.params.id, req.body);
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/campaigns', async (_req, res) => {
    try {
      const campaigns = await growth.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/viral-loops', async (req, res) => {
    try {
      const { type, trigger, reward } = req.body;
      if (!type || !trigger || !reward) {
        res.status(400).json({ error: 'type, trigger, and reward required' });
        return;
      }
      const loop = await growth.createViralLoop({ type, trigger, reward });
      res.status(201).json(loop);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/viral-loops/:id/trigger', async (req, res) => {
    try {
      const loop = await growth.triggerViralLoop(req.params.id);
      if (!loop) {
        res.status(404).json({ error: 'Viral loop not found or inactive' });
        return;
      }
      res.json(loop);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/viral-loops', async (_req, res) => {
    try {
      const loops = await growth.getViralLoops();
      res.json(loops);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
