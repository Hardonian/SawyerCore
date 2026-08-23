/**
 * Example: Node.js Express Backend with SawyerCore Integration
 * Demonstrates multi-tenant task proxying, quota validation, and degraded state handling.
 */

import express, { Request, Response } from 'express';
import { SawyerClient, ServiceDegradedError, QuotaExceededError } from '../../sdk/index.js';

const app = express();
app.use(express.json());

const sawyer = new SawyerClient({
  apiKey: process.env.SAWYER_API_KEY || 'test-key',
  endpoint: process.env.SAWYER_ENDPOINT || 'http://127.0.0.1:8787',
});

// Middleware: Verify Sawyer Engine Health
app.use('/ai', async (_req, res, next) => {
  try {
    const health = await sawyer.health();
    if (health.status !== 'ok') {
      res.status(503).json({ error: 'Sawyer engine is unhealthy' });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: 'Cannot connect to Sawyer engine' });
  }
});

// Route: AI Chat with Error Mapping
app.post('/ai/chat', async (req: Request, res: Response) => {
  const { prompt, privacy } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  try {
    const result = await sawyer.tasks.run({
      type: 'chat',
      input: prompt,
      privacy: privacy || 'private',
    });

    res.json({
      success: true,
      data: result.output,
      meta: {
        latencyMs: result.latencyMs,
        provider: result.provider,
        degradedState: result.degradedState,
      },
    });
  } catch (error) {
    if (error instanceof ServiceDegradedError) {
      res.status(503).json({
        error: error.message,
        degradedState: error.degradedState,
        recovery: 'Local model is offline. Start provider and retry.',
      });
    } else if (error instanceof QuotaExceededError) {
      res.status(429).json({
        error: error.message,
        details: error.details,
      });
    } else {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express AI Backend listening on http://127.0.0.1:${PORT}`);
});
