/** Mirrors the API's Snapshot: the whole receiver state, shaped for the UI. */
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
  /** Bass, treble and subwoofer trim, in dB, with the range the receiver accepts. */
  sound: {
    controls: Array<{ key: ToneControl; label: string; db: number | null }>;
    minDb: number;
    maxDb: number;
    stepDb: number;
  };
  display: { info: number | null; options: Array<{ value: number; label: string }> };
  /** What the streamer is playing; null when nothing is loaded. */
  player: NowPlaying | null;
  tv: {
    /** False when the TV is off — it cannot be woken over the network. */
    available: boolean;
    current: string | null;
    targets: Array<{ key: string; label: string }>;
    /** OLED pixel brightness, 0-100, or null when the set has not reported one. */
    backlight: number | null;
  };
}

/** The three trims the Sound card offers. Named by the API, not by position. */
export type ToneControl = 'bass' | 'treble' | 'subwoofer';

export interface NowPlaying {
  state: 'playing' | 'paused' | 'loading' | 'stopped';
  title: string | null;
  artist: string | null;
  album: string | null;
  image: string | null;
  service: string | null;
  /** Seconds into the track, and its length — absent for live radio. */
  elapsed: number | null;
  duration: number | null;
  /** Whether the streamer will accept a seek — false for live radio. */
  canSeek: boolean;
}

export type PlayerAction = 'play' | 'pause' | 'next' | 'previous';

/**
 * The receiver's full volume range, in dB. Its own percent scale is exactly
 * `dB + 90` across this span, so the dial reads the same number the receiver does.
 */
export const MIN_DB = -90;
export const MAX_DB = 10;

/** Where the state comes from: one stream, pushed by the receiver itself. */
export const EVENTS_URL = '/api/events';

/**
 * The API answered, and said no. Exported because that is a meaningful distinction for
 * a caller: an `ApiError` proves the app can reach the API, so a device refusing a
 * write is not the same event as the app being offline.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function write(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(problem.message ?? response.statusText, response.status);
  }
}

// Writes stay REST; the resulting change comes back on the stream like any other.
export const setPower = (power: boolean) => write('/api/power', { power });
export const stepVolume = (steps: number) =>
  fetch('/api/volume/step', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ steps }),
  }).then((response) => {
    if (!response.ok) throw new ApiError(response.statusText, response.status);
  });
/** Absolute level, for the player's slider. The buttons use the step route instead. */
export const setVolumeDb = (db: number) => write('/api/volume', { db });
export const selectInput = (input: number) => write('/api/input', { input });
export const setSpeakerProfile = (profile: number) => write('/api/speaker-profile', { profile });
export const setDisplay = (info: number) => write('/api/display', { info });
/** One trim at a time, which is all a slider ever moves. */
export const setSound = (control: ToneControl, db: number) => write('/api/sound', { [control]: db });

export const selectTvTarget = (target: string) => write('/api/tv', { target });

/** The remote keys the TV accepts. Mirrors the API's own list. */
export type TvKeyName = 'up' | 'down' | 'left' | 'right' | 'enter' | 'back' | 'menu';

/**
 * A press, not a state: nothing to read back, so nothing is written optimistically and
 * the snapshot does not change. The TV either takes it or the request fails.
 */
export const sendTvKey = (key: TvKeyName) =>
  fetch('/api/tv/key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  }).then((response) => {
    if (!response.ok) throw new ApiError(response.statusText, response.status);
  });

/**
 * Brightness moves in steps, never as a level: the TV owns the value, and the API reads
 * it before writing so a change made with the set's own remote is never overwritten by
 * a stale number from here.
 */
export const stepTvBacklight = (steps: number) =>
  fetch('/api/tv/backlight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ steps }),
  }).then((response) => {
    if (!response.ok) throw new ApiError(response.statusText, response.status);
  });

const player = (body: unknown) =>
  fetch('/api/player', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => {
    if (!response.ok) throw new ApiError(response.statusText, response.status);
  });

export const playerAction = (action: PlayerAction) => player({ action });
export const seekPlayer = (seconds: number) => player({ action: 'seek', seconds });
