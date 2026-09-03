import { Router } from 'express';
import { z } from 'zod';
import { TV_KEY_NAMES } from '../tv/keys.js';
import type { WebosTv } from '../tv/webos.js';
import { parseBody } from './zone.js';

const targetBody = z.object({ target: z.string().min(1).max(40) });
/* The key names are a closed set, so an unknown one is a 400 rather than something the
   TV is asked about. */
const keyBody = z.object({ key: z.enum(TV_KEY_NAMES) });

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

  /*
   * A press, not a state: there is nothing to read back and nothing to be optimistic
   * about. The set either takes the key or the request fails.
   */
  router.post('/tv/key', async (req, res, next) => {
    try {
      const { key } = parseBody(keyBody, req.body);
      await tv.sendKey(key);
      res.json({ key });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
