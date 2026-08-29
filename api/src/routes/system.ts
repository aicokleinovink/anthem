import { Router } from 'express';
import { config } from '../config.js';
import type { Receiver } from '../device/receiver.js';

export function systemRoutes(receiver: Receiver): Router {
  const router = Router();

  router.get('/health', async (_req, res, next) => {
    try {
      const identity = await receiver.identity();
      res.json({ ...identity, host: config.host, port: config.port });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/state', (_req, res) => {
    res.json(receiver.state);
  });

  return router;
}
