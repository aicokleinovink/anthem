import { Router } from 'express';
import { z } from 'zod';
import type { Receiver } from '../device/receiver.js';
import { DISPLAY_OPTIONS as INFO_OPTIONS } from '../device/snapshot.js';
import { parseBody } from './zone.js';

const displayBody = z.object({ info: z.number().int().min(0).max(1) });

export function displayRoutes(receiver: Receiver): Router {
  const router = Router();

  router.get('/display', async (_req, res, next) => {
    try {
      const info = await receiver.getFrontPanelInfo();
      res.json({ info: info ?? null, options: INFO_OPTIONS });
    } catch (error) {
      next(error);
    }
  });

  router.put('/display', async (req, res, next) => {
    try {
      const { info } = parseBody(displayBody, req.body);
      const applied = await receiver.setFrontPanelInfo(info);
      res.json({ info: applied ?? null, options: INFO_OPTIONS });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
