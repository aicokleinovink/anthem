import { config } from '../config.js';

/**
 * The receiver exposes volume both in dB and as a 0-100 percentage, and the two are a
 * straight linear map across its -90 .. +10 dB range (it reported -81.0 dB as 9%).
 * These helpers exist only so a percent request can be clamped against the dB safety
 * ceiling — the authoritative value always comes back from the device.
 */
export function percentToDb(percent: number): number {
  const span = config.deviceMaxVolumeDb - config.minVolumeDb;
  return config.minVolumeDb + (clamp(percent, 0, 100) / 100) * span;
}

export function dbToPercent(db: number): number {
  const span = config.deviceMaxVolumeDb - config.minVolumeDb;
  return Math.round(((db - config.minVolumeDb) / span) * 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamp a requested dB level into the configured safe range. */
export function clampDb(db: number): number {
  return clamp(db, config.minVolumeDb, config.maxVolumeDb);
}
