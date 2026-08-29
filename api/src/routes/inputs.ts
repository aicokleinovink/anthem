import { Router } from 'express';
import { z } from 'zod';
import type { Receiver } from '../device/receiver.js';
import { parseBody, zoneOf } from './zone.js';

const inputBody = z.object({ input: z.number().int().min(1).max(30) });

export function inputRoutes(receiver: Receiver): Router {
  const router = Router({ mergeParams: true });

  /**
   * Everything the inputs UI needs in one call: the list, what is selected, and what
   * signal is arriving. Names come from cache after the first request.
   */
  router.get('/inputs', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const inputs = await receiver.listInputs();
      const selected = await receiver.getInput(zone);
      const format = await receiver.getAudioFormat(zone);
      res.json({ inputs, selected: selected ?? null, format: format ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.put('/input', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const { input } = parseBody(inputBody, req.body);
      const selected = await receiver.setInput(zone, input);
      res.json({ selected: selected ?? null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
