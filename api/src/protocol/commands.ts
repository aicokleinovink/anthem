/**
 * The single source of protocol truth for the Anthem "Gen 4" IP control dialect
 * (MRX 540/740/1140, AVM 70/90).
 *
 * Transport is raw TCP on port 14999. Every command and every reply is ASCII and is
 * terminated by ';'. Setting is `Z1POW1;`, querying is `Z1POW?;`, and the reply to
 * both is the current state in set form: `Z1POW1;`.
 *
 * Every string below was verified against a real MRX 540 (software 00.80/00.04).
 *
 * Two findings from that unit that contradict the obvious reading of the spec:
 *
 * 1. `Z1VOL<n>;` is NOT a usable absolute setter. Sending `Z1VOL-50;` from -70 dB left
 *    the receiver at -78 dB, and `Z1VOL-75;` from -78 dB left it at -87 dB — the value
 *    is not taken as a target and the resulting level is not reproducible. `Z1VOL?;`
 *    is, however, a perfectly good *query*, and is the authoritative dB readout.
 *    So we read dB with `Z1VOL?;` and write with `Z1PVOL`, which is exactly absolute:
 *    `Z1PVOL20;` lands on -70.0 dB every time.
 * 2. `Z1VUP;` / `Z1VDN;` take NO argument and move exactly 1 dB. `Z1VUP1;` is rejected
 *    with `!IZ1VUP1;` ("invalid command").
 *
 * The percent and dB scales are the same scale: percent === dB + 90, over -90 .. +10 dB.
 */

export const TERMINATOR = ';';

export type Zone = 1 | 2;

/**
 * Zone-scoped keys. Ordered longest-first so `PVOL` is matched before `POW` when
 * splitting a reply into key + value.
 */
export const ZONE_KEYS = [
  'PVOL', // volume as a percentage, 0-100
  'POW', //  power, 0 | 1
  'VOL', //  volume in dB, one decimal
  'VUP', //  step volume up by 1 dB (takes NO argument)
  'VDN', //  step volume down by 1 dB (takes NO argument)
  'MUT', //  mute, 0 | 1 | t (toggle)
  'INP', //  selected input number
  'ALM', //  listening mode
  'AIN', //  incoming audio format (read-only)
] as const;

export type ZoneKey = (typeof ZONE_KEYS)[number];

/** Global (non-zone) keys, also longest-first. */
export const GLOBAL_KEYS = [
  'IDM', // model name, e.g. "MRX 540"
  'IDS', // software version
  'IDR', // region
  'IDN', // MAC address
  'ICN', // number of available inputs
  'GCFPDI', // front panel displayed info: 0 = All, 1 = Volume Only
] as const;

export type GlobalKey = (typeof GLOBAL_KEYS)[number];

/** Build a zone command: `zone(1, 'VOL', -30)` -> `"Z1VOL-30;"`. */
export function zoneCommand(zone: Zone, key: ZoneKey, value: string | number): string {
  return `Z${zone}${key}${value}${TERMINATOR}`;
}

/** Build a zone query: `zoneQuery(1, 'POW')` -> `"Z1POW?;"`. */
export function zoneQuery(zone: Zone, key: ZoneKey): string {
  return `Z${zone}${key}?${TERMINATOR}`;
}

/** Build a global query: `globalQuery('IDM')` -> `"IDM?;"`. */
export function globalQuery(key: GlobalKey): string {
  return `${key}?${TERMINATOR}`;
}

export const commands = {
  power: (zone: Zone, on: boolean) => zoneCommand(zone, 'POW', on ? 1 : 0),
  powerQuery: (zone: Zone) => zoneQuery(zone, 'POW'),

  /**
   * Authoritative volume readout, in dB. Read-only as far as we are concerned:
   * see the note above about `Z1VOL` as a setter.
   */
  volumeDbQuery: (zone: Zone) => zoneQuery(zone, 'VOL'),

  /** The absolute volume setter, 0-100. 1% == 1 dB on this unit. */
  volumePercent: (zone: Zone, percent: number) => zoneCommand(zone, 'PVOL', Math.round(percent)),
  volumePercentQuery: (zone: Zone) => zoneQuery(zone, 'PVOL'),

  /** Relative volume change, exactly 1 dB per command. No argument is accepted. */
  volumeUp: (zone: Zone) => zoneCommand(zone, 'VUP', ''),
  volumeDown: (zone: Zone) => zoneCommand(zone, 'VDN', ''),

  mute: (zone: Zone, muted: boolean) => zoneCommand(zone, 'MUT', muted ? 1 : 0),
  muteToggle: (zone: Zone) => zoneCommand(zone, 'MUT', 't'),
  muteQuery: (zone: Zone) => zoneQuery(zone, 'MUT'),

  /** Selected input number for a zone. */
  input: (zone: Zone, input: number) => zoneCommand(zone, 'INP', Math.round(input)),
  inputQuery: (zone: Zone) => zoneQuery(zone, 'INP'),

  /** Name of input n, e.g. `IS3IN?;` -> `IS3INTV / PlayStation;`. */
  inputNameQuery: (input: number) => `IS${Math.round(input)}IN?${TERMINATOR}`,

  /**
   * Speaker profile assigned to an input. The value is **0-based** while profile
   * numbers are 1-based: `IS3SP1` means input 3 uses profile 2. The receiver's own web
   * app does exactly this (`current_profile = value + 1`).
   */
  inputProfile: (input: number, profile: number) =>
    `IS${Math.round(input)}SP${Math.round(profile)}${TERMINATOR}`,
  inputProfileQuery: (input: number) => `IS${Math.round(input)}SP?${TERMINATOR}`,

  /** Name of speaker profile n (1-based), e.g. `SSSP10?;` -> `SSSP10Center;`. */
  profileNameQuery: (profile: number) => `SSSP${Math.round(profile)}0?${TERMINATOR}`,

  /** Format of the signal currently arriving, e.g. "Dolby D+" or "No Signal". */
  audioFormatQuery: (zone: Zone) => zoneQuery(zone, 'AIN'),

  /**
   * What the receiver's front panel shows: `0` All, `1` Volume Only. This is
   * Setup > General > Front Panel Displayed Info in Anthem's own app.
   */
  frontPanelInfo: (value: number) => `GCFPDI${Math.round(value)}${TERMINATOR}`,
  frontPanelInfoQuery: () => globalQuery('GCFPDI'),

  model: () => globalQuery('IDM'),
  software: () => globalQuery('IDS'),
  region: () => globalQuery('IDR'),
  inputCount: () => globalQuery('ICN'),
} as const;
