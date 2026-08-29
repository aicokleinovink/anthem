import { Router } from 'express';
import { z } from 'zod';
import type { Receiver } from '../device/receiver.js';
import { parseBody, zoneOf } from './zone.js';

const powerBody = z.object({ power: z.boolean() });

export function powerRoutes(receiver: Receiver): Router {
  const router = Router({ mergeParams: true });

  router.get('/power', async (req, res, next) => {
    try {
      res.json({ power: await receiver.getPower(zoneOf(req)) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/power', async (req, res, next) => {
    try {
      const { power } = parseBody(powerBody, req.body);
      res.json({ power: await receiver.setPower(zoneOf(req), power) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/power/toggle', async (req, res, next) => {
    try {
      res.json({ power: await receiver.togglePower(zoneOf(req)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
