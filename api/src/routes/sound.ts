import { Router } from 'express';
import { z } from 'zod';
import type { Receiver } from '../device/receiver.js';
import { TONE_LABELS } from '../device/snapshot.js';
import { TONE_MAX_DB, TONE_MIN_DB, TONE_STEP_DB } from '../device/tone.js';
import { TONE_CONTROLS } from '../protocol/commands.js';
import { parseBody, zoneOf } from './zone.js';

/**
 * Any subset of the three, so one request can move one slider or all of them. Values
 * outside the range are refused here rather than quietly rounded into it: a slider
 * cannot produce one, so a request that does is a mistake worth hearing about.
 */
const soundBody = z
  .object({
    bass: z.number().min(TONE_MIN_DB).max(TONE_MAX_DB).optional(),
    treble: z.number().min(TONE_MIN_DB).max(TONE_MAX_DB).optional(),
    subwoofer: z.number().min(TONE_MIN_DB).max(TONE_MAX_DB).optional(),
  })
  .refine((body) => TONE_CONTROLS.some((control) => body[control] !== undefined), {
    message: 'provide at least one of "bass", "treble" or "subwoofer"',
  });

/** Shape every response the same way, from what the receiver confirmed. */
const soundResponse = (receiver: Receiver, zone: 1 | 2) => ({
  controls: TONE_CONTROLS.map((key) => ({
    key,
    label: TONE_LABELS[key],
    db: receiver.state.zones[zone].tone[key] ?? null,
  })),
  minDb: TONE_MIN_DB,
  maxDb: TONE_MAX_DB,
  stepDb: TONE_STEP_DB,
});

export function soundRoutes(receiver: Receiver): Router {
  const router = Router({ mergeParams: true });

  router.get('/sound', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      await receiver.getTone(zone);
      res.json(soundResponse(receiver, zone));
    } catch (error) {
      next(error);
    }
  });

  router.put('/sound', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const body = parseBody(soundBody, req.body);
      // Sequential on purpose: the transport paces writes, and a set of three is a
      // handful of commands the receiver would otherwise drop.
      for (const control of TONE_CONTROLS) {
        const db = body[control];
        if (db !== undefined) await receiver.setTone(zone, control, db);
      }
      res.json(soundResponse(receiver, zone));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
