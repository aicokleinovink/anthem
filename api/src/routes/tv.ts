import { Router } from 'express';
import { z } from 'zod';
import { TV_KEY_NAMES } from '../tv/keys.js';
import type { WebosTv } from '../tv/webos.js';
import { parseBody } from './zone.js';

const targetBody = z.object({ target: z.string().min(1).max(40) });
/* The key names are a closed set, so an unknown one is a 400 rather than something the
   TV is asked about. */
const keyBody = z.object({ key: z.enum(TV_KEY_NAMES) });
/* A step, not a level: the set owns the value, so the app says "10 dimmer" and the API
   reads, adds and writes back. */
const backlightBody = z.object({ steps: z.number().int().min(-100).max(100) });

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

  /*
   * Brightness moves in steps because the TV is the authority on where it currently is:
   * reading, adding and writing here keeps the app from ever fighting a change made with
   * the set's own remote.
   */
  router.post('/tv/backlight', async (req, res, next) => {
    try {
      const { steps } = parseBody(backlightBody, req.body);
      const current = await tv.readBacklight();
      if (current === null) throw new Error('TV would not report its picture settings');
      const target = Math.min(100, Math.max(0, current + steps));
      if (target !== current) await tv.setBacklight(target);
      res.json({ backlight: tv.backlight });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
