import { Router } from 'express';
import { z } from 'zod';
import { DeviceCommandError } from '../errors.js';
import type { Receiver } from '../device/receiver.js';
import { parseBody, zoneOf } from './zone.js';

const profileBody = z.object({
  /** The receiver's 0-based value: 0 selects profile 1. */
  profile: z.number().int().min(0).max(3),
  /** Defaults to whatever input the zone is currently on. */
  input: z.number().int().min(1).max(30).optional(),
});

/**
 * Speaker profiles are a per-input setting on this receiver — the same thing as
 * Setup > Inputs > <input> > Speaker Profile in Anthem's own app.
 */
export function profileRoutes(receiver: Receiver): Router {
  const router = Router({ mergeParams: true });

  router.get('/speaker-profiles', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const profiles = await receiver.listProfiles();
      const input = await receiver.getInput(zone);

      if (input === undefined) {
        throw new DeviceCommandError('Receiver did not report a current input', 'ZnINP?');
      }

      const selected = await receiver.getInputProfile(input);
      const inputs = await receiver.listInputs();

      res.json({
        profiles,
        input,
        inputName: inputs.find((entry) => entry.input === input)?.name ?? `Input ${input}`,
        selected: selected ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/speaker-profile', async (req, res, next) => {
    try {
      const zone = zoneOf(req);
      const body = parseBody(profileBody, req.body);
      const input = body.input ?? (await receiver.getInput(zone));

      if (input === undefined) {
        throw new DeviceCommandError('Receiver did not report a current input', 'ZnINP?');
      }

      const selected = await receiver.setInputProfile(input, body.profile);
      res.json({ input, selected: selected ?? null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
