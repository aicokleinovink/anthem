import { GLOBAL_KEYS, TERMINATOR, ZONE_KEYS, type GlobalKey, type Zone, type ZoneKey } from './commands.js';

export type Message =
  | { kind: 'zone'; zone: Zone; key: ZoneKey; value: string }
  | { kind: 'global'; key: GlobalKey; value: string }
  | { kind: 'inputName'; input: number; value: string }
  /** Speaker profile assigned to an input; `value` is 0-based. */
  | { kind: 'inputProfile'; input: number; value: string }
  /** Name of a speaker profile; `profile` is 1-based. */
  | { kind: 'profileName'; profile: number; value: string }
  | { kind: 'error'; raw: string }
  | { kind: 'unknown'; raw: string };

const ZONE_KEY_PATTERN = ZONE_KEYS.join('|');
const GLOBAL_KEY_PATTERN = GLOBAL_KEYS.join('|');

// Keys are alternated longest-first (see ZONE_KEYS) so `Z1PVOL9` reads as PVOL=9
// rather than POW=... — regex alternation takes the first branch that matches.
const ZONE_RE = new RegExp(`^Z([12])(${ZONE_KEY_PATTERN})(.*)$`);
const GLOBAL_RE = new RegExp(`^(${GLOBAL_KEY_PATTERN})(.*)$`);
const INPUT_NAME_RE = /^IS(\d+)IN(.*)$/;
const INPUT_PROFILE_RE = /^IS(\d+)SP(.*)$/;
const PROFILE_NAME_RE = /^SSSP(\d+)0(.*)$/;

/**
 * Split a raw buffer into complete ';'-terminated frames, returning any trailing
 * partial frame so the caller can prepend it to the next chunk.
 */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split(TERMINATOR);
  const rest = parts.pop() ?? '';
  return { frames: parts.filter((frame) => frame.length > 0), rest };
}

/** Parse one frame (without its terminator) into a structured message. */
export function parseMessage(raw: string): Message {
  // The receiver prefixes rejected commands with '!'.
  if (raw.startsWith('!')) return { kind: 'error', raw };

  const zone = ZONE_RE.exec(raw);
  if (zone) {
    return {
      kind: 'zone',
      zone: Number(zone[1]) as Zone,
      key: zone[2] as ZoneKey,
      value: zone[3] ?? '',
    };
  }

  const inputName = INPUT_NAME_RE.exec(raw);
  if (inputName) {
    return { kind: 'inputName', input: Number(inputName[1]), value: inputName[2] ?? '' };
  }

  const inputProfile = INPUT_PROFILE_RE.exec(raw);
  if (inputProfile) {
    return { kind: 'inputProfile', input: Number(inputProfile[1]), value: inputProfile[2] ?? '' };
  }

  const profileName = PROFILE_NAME_RE.exec(raw);
  if (profileName) {
    return { kind: 'profileName', profile: Number(profileName[1]), value: profileName[2] ?? '' };
  }

  const global = GLOBAL_RE.exec(raw);
  if (global) {
    return { kind: 'global', key: global[1] as GlobalKey, value: global[2] ?? '' };
  }

  return { kind: 'unknown', raw };
}

/** Parse a numeric payload, returning undefined rather than NaN. */
export function toNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse a boolean payload ('1' / '0'). */
export function toBoolean(value: string): boolean | undefined {
  if (value === '1') return true;
  if (value === '0') return false;
  return undefined;
}
