import { Router } from 'express';
import type { Receiver } from '../device/receiver.js';
import { snapshot } from '../device/snapshot.js';
import type { Player } from '../player/player.js';

/**
 * A real event rather than a comment, every 10s. It keeps proxies from dropping an idle
 * stream, and — more importantly — gives the client something to miss: a proxy can hold
 * the connection open after this service dies, so silence is the only symptom.
 */
const HEARTBEAT_MS = 10_000;

/**
 * The whole state of the receiver as a stream.
 *
 * The receiver pushes every change to every connected client — verified: another app
 * changing volume, input, speaker profile or the display setting all arrive here within
 * about 50ms — so clients never need to poll. They read here and write over REST.
 */
export function eventRoutes(receiver: Receiver, player: Player): Router {
  const router = Router();

  router.get('/events', (req, res) => {
    res.set({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Tell any proxy in the way not to buffer this.
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();

    const send = () => {
      res.write(`data: ${JSON.stringify(snapshot(receiver.state, player.now))}\n\n`);
    };

    send(); // current state first, so a new client renders immediately
    receiver.on('changed', send);
    player.on('changed', send);
    const heartbeat = setInterval(() => res.write('event: ping\ndata: {}\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      receiver.off('changed', send);
      player.off('changed', send);
    });
  });

  return router;
}
