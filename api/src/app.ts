import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import type { Receiver } from './device/receiver.js';
import type { Player } from './player/player.js';
import { displayRoutes } from './routes/display.js';
import { eventRoutes } from './routes/events.js';
import { inputRoutes } from './routes/inputs.js';
import { playerRoutes } from './routes/player.js';
import { powerRoutes } from './routes/power.js';
import { profileRoutes } from './routes/profiles.js';
import { systemRoutes } from './routes/system.js';
import { volumeRoutes } from './routes/volume.js';

/**
 * Serve the built frontend, so the whole thing is one process on one port. Mounted
 * after the API routes and before the 404 handler; skipped when there is no build,
 * which is the normal case in development (Vite serves the UI and proxies here).
 */
function serveFrontend(app: express.Express): void {
  const dir = config.frontendDir;
  const index = path.join(dir, 'index.html');

  if (!fs.existsSync(index)) {
    console.log(`[anthem] no frontend build at ${dir} — serving the API only`);
    return;
  }

  // Vite fingerprints asset filenames, so they can be cached hard; index.html cannot.
  app.use(express.static(dir, { index: false, maxAge: '1y', immutable: true }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(index);
  });

  console.log(`[anthem] serving the UI from ${dir}`);
}

interface HttpError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

export function createApp(receiver: Receiver, player: Player): express.Express {
  const app = express();
  app.use(express.json());

  app.use(systemRoutes(receiver));
  app.use('/api', eventRoutes(receiver, player));
  app.use('/api', playerRoutes(player));

  // Zone-scoped routes, plus zone-1 aliases so /api/volume works without a zone.
  for (const mount of ['/api/zones/:zone', '/api']) {
    app.use(mount, powerRoutes(receiver));
    app.use(mount, volumeRoutes(receiver));
    app.use(mount, inputRoutes(receiver));
    app.use(mount, profileRoutes(receiver));
    app.use(mount, displayRoutes(receiver));
  }

  serveFrontend(app);

  // Anything still unmatched is an API path that does not exist.
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status ?? 500;
    if (status >= 500) console.error('[anthem]', error);
    res.status(status).json({
      error: error.code ?? 'internal_error',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
}
