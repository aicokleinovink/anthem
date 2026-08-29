import { Router } from 'express';
import { z } from 'zod';
import type { WebosTv } from '../tv/webos.js';
import { parseBody } from './zone.js';

const targetBody = z.object({ target: z.string().min(1).max(40) });

export function tvRoutes(tv: WebosTv): Router {
  const router = Router();

  router.put('/tv', async (req, res, next) => {
    try {
      const { target } = parseBody(targetBody, req.body);
      await tv.select(target);
      // The TV reports the change on its own subscription a moment later.
      res.json({ target });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
