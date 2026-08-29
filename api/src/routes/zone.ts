import type { Request } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../errors.js';
import type { Zone } from '../protocol/commands.js';

const zoneSchema = z.coerce.number().int().refine((n): n is Zone => n === 1 || n === 2, {
  message: 'zone must be 1 or 2',
});

/** Read the :zone route param, defaulting to zone 1 for the alias routes. */
export function zoneOf(req: Request): Zone {
  const raw = req.params.zone;
  if (raw === undefined) return 1;

  const result = zoneSchema.safeParse(raw);
  if (!result.success) throw new BadRequestError('Invalid zone', result.error.issues);
  return result.data;
}

/** Validate a request body, turning a zod failure into a 400. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError('Invalid request body', result.error.issues);
  return result.data;
}
