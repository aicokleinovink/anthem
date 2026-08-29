import express, { type NextFunction, type Request, type Response } from 'express';
import type { Receiver } from './device/receiver.js';
import { displayRoutes } from './routes/display.js';
import { inputRoutes } from './routes/inputs.js';
import { powerRoutes } from './routes/power.js';
import { profileRoutes } from './routes/profiles.js';
import { systemRoutes } from './routes/system.js';
import { volumeRoutes } from './routes/volume.js';

interface HttpError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

export function createApp(receiver: Receiver): express.Express {
  const app = express();
  app.use(express.json());

  app.use(systemRoutes(receiver));

  // Zone-scoped routes, plus zone-1 aliases so /api/volume works without a zone.
  for (const mount of ['/api/zones/:zone', '/api']) {
    app.use(mount, powerRoutes(receiver));
    app.use(mount, volumeRoutes(receiver));
    app.use(mount, inputRoutes(receiver));
    app.use(mount, profileRoutes(receiver));
    app.use(mount, displayRoutes(receiver));
  }

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
