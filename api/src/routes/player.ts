import { Router } from 'express';
import { z } from 'zod';
import type { Player } from '../player/player.js';
import { parseBody } from './zone.js';

/**
 * Seek carries a position and the rest do not, so the body is a union rather than one
 * object with an optional field — that way `{ action: 'seek' }` with no position is a
 * 400 instead of a silent jump to zero.
 */
const actionBody = z.union([
  z.object({ action: z.enum(['play', 'pause', 'next', 'previous']) }),
  z.object({ action: z.literal('seek'), seconds: z.number().nonnegative().finite() }),
]);

/** Transport controls, passed through to the streamer. */
export function playerRoutes(player: Player): Router {
  const router = Router();

  router.post('/player', async (req, res, next) => {
    try {
      const body = parseBody(actionBody, req.body);

      if (body.action === 'seek') await player.seek(body.seconds);
      else await player.act(body.action);

      // The Node reports the result on its own status stream a moment later.
      res.json({ action: body.action });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
