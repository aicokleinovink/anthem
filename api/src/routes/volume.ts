import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import type { Receiver } from '../device/receiver.js';
import { dbToPercent } from '../device/volume.js';
import { parseBody, zoneOf } from './zone.js';

const volumeBody = z
  .object({
    db: z.number().min(config.minVolumeDb).max(config.deviceMaxVolumeDb).optional(),
    percent: z.number().min(0).max(100).optional(),
  })
  .refine((body) => (body.db === undefined) !== (body.percent === undefined), {
    message: 'provide exactly one of "db" or "percent"',
  });

/** One step is 1 dB. Bounded so a single request cannot walk the volume far. */
const stepBody = z.object({ steps: z.number().int().min(-20).max(20) });

const muteBody = z
  .object({ muted: z.boolean().optional(), toggle: z.boolean().optional() })
  .refine((body) => body.muted !== undefined || body.toggle === true, {
    message: 'provide "muted" or "toggle": true',
  });

/** Shape every volume response the same way, from the device-confirmed dB value. */
const volumeResponse = (db: number, muted: boolean | undefined) => ({
  db,
  percent: dbToPercent(db),
  muted: muted ?? false,
  maxDb: config.maxVolumeDb,
});

export function volumeRoutes(receiver: Receiver): Router {
  const router = Router({ mergeParams: true });

  router.get('/volume', async (req, res, next) => {
    try {
      const zone = await receiver.getVolume(zoneOf(req));
      res.json(volumeResponse(zone.volumeDb, zone.muted));
    } catch (error) {
      next(error);
    }
  });

  router.put('/volume', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const body = parseBody(volumeBody, req.body);
      const db =
        body.db !== undefined
          ? await receiver.setVolumeDb(zone, body.db)
          : await receiver.setVolumePercent(zone, body.percent!);
      res.json(volumeResponse(db, receiver.state.zones[zone].muted));
    } catch (error) {
      next(error);
    }
  });

  router.post('/volume/step', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const { steps } = parseBody(stepBody, req.body);
      const db = await receiver.stepVolume(zone, steps);
      res.json(volumeResponse(db, receiver.state.zones[zone].muted));
    } catch (error) {
      next(error);
    }
  });

  router.put('/mute', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const body = parseBody(muteBody, req.body);
      const muted =
        body.toggle === true
          ? await receiver.toggleMute(zone)
          : await receiver.setMute(zone, body.muted!);
      res.json({ muted });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
