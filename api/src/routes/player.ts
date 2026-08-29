import { Router } from 'express';
import { z } from 'zod';
import type { Player } from '../player/player.js';
import { parseBody } from './zone.js';

const actionBody = z.object({
  action: z.enum(['play', 'pause', 'next', 'previous']),
});

/** Transport controls, passed through to the streamer. */
export function playerRoutes(player: Player): Router {
  const router = Router();

  router.post('/player', async (req, res, next) => {
    try {
      const { action } = parseBody(actionBody, req.body);
      await player.act(action);
      // The Node reports the result on its own status stream a moment later.
      res.json({ action });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
