import { clamp } from './volume.js';

/**
 * The range the receiver accepts for bass, treble and subwoofer trim, verified against
 * the unit: -10.0 .. +10.0 dB on a 0.5 dB grid, which is also what the receiver's own
 * web app puts on its sliders (`min="-10" max="10" step="0.5"`).
 */
export const TONE_MIN_DB = -10;
export const TONE_MAX_DB = 10;
export const TONE_STEP_DB = 0.5;

/**
 * Round and clamp a requested level onto the grid the receiver will accept.
 *
 * This is not politeness. Unlike volume, the receiver does not clamp a tone value it
 * dislikes — it rejects the whole command: `Z1TON015;` and `Z1TON00.25;` both came back
 * as `!E...` with the level unchanged. So anything heading for the wire has to be made
 * legal here first.
 */
export function quantiseTone(db: number): number {
  const stepped = Math.round(db / TONE_STEP_DB) * TONE_STEP_DB;
  return clamp(stepped, TONE_MIN_DB, TONE_MAX_DB);
}
