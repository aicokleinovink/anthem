import path from 'node:path';

const num = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got "${value}"`);
  return parsed;
};

/**
 * Volume range the receiver accepts, in dB. Derived from the device's own percent
 * scale: it reported -81.0 dB as 9%, i.e. percent === dB + 90 over a 100 dB span.
 */
const MIN_VOLUME_DB = -90;
const DEVICE_MAX_VOLUME_DB = 10;

export const config = {
  /** Receiver IP address. The MRX 540 listens for IP control on TCP 14999. */
  host: process.env.ANTHEM_HOST ?? '192.168.2.3',
  port: num(process.env.ANTHEM_PORT, 14999),

  /** HTTP port for this API. */
  httpPort: num(process.env.PORT, 3000),

  /**
   * Optional soft ceiling for volume writes, in dB. Off by default: the receiver has
   * its own Maximum Volume setting, which is the right place to limit it — this would
   * only be a second, hidden limit that the UI would then have to explain. Set
   * MAX_VOLUME_DB if you want the API to clamp below whatever the receiver allows.
   */
  maxVolumeDb: num(process.env.MAX_VOLUME_DB, DEVICE_MAX_VOLUME_DB),

  minVolumeDb: MIN_VOLUME_DB,
  deviceMaxVolumeDb: DEVICE_MAX_VOLUME_DB,

  /**
   * Built frontend to serve alongside the API, so one process on one port is the whole
   * app. Resolved from the working directory rather than from this file's location:
   * after `tsc` the compiled file sits a level deeper and a relative hop would miss.
   * Serving is skipped entirely when the directory does not exist.
   */
  frontendDir: process.env.FRONTEND_DIR ?? path.resolve(process.cwd(), '../frontend/dist'),

  /** How long to wait for the receiver to answer a command. */
  commandTimeoutMs: 3000,
} as const;

export type Config = typeof config;
