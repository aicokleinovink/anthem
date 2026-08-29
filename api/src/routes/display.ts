import { Router } from 'express';
import { z } from 'zod';
import type { Receiver } from '../device/receiver.js';
import { parseBody } from './zone.js';

const displayBody = z.object({ info: z.number().int().min(0).max(1) });

/**
 * Labels come from the receiver's own setup UI — the device reports only the number.
 * Index is the wire value: 0 = All, 1 = Volume Only.
 */
const INFO_OPTIONS = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Volume Only' },
];

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
