import { config } from '../config.js';
import type { NowPlaying } from '../player/bluos.js';
import type { TvTarget } from '../tv/targets.js';
import { TONE_CONTROLS, type ToneControl, type Zone } from '../protocol/commands.js';
import { TONE_MAX_DB, TONE_MIN_DB, TONE_STEP_DB } from './tone.js';
import { dbToPercent } from './volume.js';
import type { ReceiverState } from './state.js';

/**
 * Everything the UI needs, in one object, derived from the cache the transport keeps
 * up to date. Shaped for the client rather than for the protocol, so the frontend
 * never has to know that volume arrives as `Z1VOL-80.0`.
 */
export interface Snapshot {
  connected: boolean;
  model?: string;
  software?: string;
  power: boolean | null;
  volume: { db: number | null; percent: number | null; muted: boolean; maxDb: number };
  inputs: {
    list: Array<{ input: number; name: string }>;
    selected: number | null;
    format: string | null;
  };
  speakerProfile: {
    profiles: Array<{ profile: number; value: number; name: string }>;
    selected: number | null;
    inputName: string | null;
  };
  /**
   * Bass, treble and subwoofer trim, in dB, with the range the receiver accepts — the
   * UI draws its sliders from this rather than hard-coding the hardware's limits.
   */
  sound: {
    controls: Array<{ key: ToneControl; label: string; db: number | null }>;
    minDb: number;
    maxDb: number;
    stepDb: number;
  };
  display: { info: number | null; options: Array<{ value: number; label: string }> };
  /** What the streamer is playing, or null when there is no streamer or nothing loaded. */
  player: NowPlaying | null;
  tv: {
    /** False when the TV is off or unreachable — it cannot be woken over the network. */
    available: boolean;
    /** Which target is on screen, when it is one we offer. */
    current: string | null;
    targets: Array<{ key: string; label: string }>;
  };
}

/** Labels for the tone controls; the receiver reports only the numbers. */
export const TONE_LABELS: Record<ToneControl, string> = {
  bass: 'Bass',
  treble: 'Treble',
  subwoofer: 'Subwoofer',
};

/** Labels for the front panel setting; the receiver reports only the number. */
export const DISPLAY_OPTIONS = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Volume Only' },
];

/** The receiver has four speaker-profile slots, named or not. */
const PROFILE_SLOTS = 4;

export interface TvState {
  available: boolean;
  current: string | null;
  targets: TvTarget[];
}

export function snapshot(
  state: ReceiverState,
  player: NowPlaying | null = null,
  tv: TvState = { available: false, current: null, targets: [] },
  zone: Zone = 1,
): Snapshot {
  const zoneState = state.zones[zone];
  const db = zoneState.volumeDb ?? null;
  const selected = zoneState.input ?? null;

  const list = Array.from({ length: state.inputCount ?? 0 }, (_unused, index) => ({
    input: index + 1,
    name: state.inputNames[index + 1] ?? `Input ${index + 1}`,
  }));

  return {
    connected: state.connected,
    model: state.model,
    software: state.software,
    power: zoneState.power ?? null,
    volume: {
      db,
      percent: db === null ? null : dbToPercent(db),
      muted: zoneState.muted ?? false,
      maxDb: config.maxVolumeDb,
    },
    inputs: { list, selected, format: zoneState.audioFormat ?? null },
    speakerProfile: {
      profiles: Array.from({ length: PROFILE_SLOTS }, (_unused, index) => ({
        profile: index + 1,
        // What the wire expects: 0 selects profile 1.
        value: index,
        name: state.profileNames[index + 1] ?? `Profile${index + 1}`,
      })),
      selected: selected === null ? null : (state.inputProfiles[selected] ?? null),
      inputName: selected === null ? null : (state.inputNames[selected] ?? null),
    },
    sound: {
      controls: TONE_CONTROLS.map((key) => ({
        key,
        label: TONE_LABELS[key],
        db: zoneState.tone[key] ?? null,
      })),
      minDb: TONE_MIN_DB,
      maxDb: TONE_MAX_DB,
      stepDb: TONE_STEP_DB,
    },
    display: { info: state.frontPanelInfo ?? null, options: DISPLAY_OPTIONS },
    // Stopped is the same as nothing playing as far as the UI is concerned.
    player: player === null || player.state === 'stopped' ? null : player,
    tv: {
      available: tv.available,
      current: tv.current,
      targets: tv.targets.map(({ key, label }) => ({ key, label })),
    },
  };
}
