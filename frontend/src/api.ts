/** Shape returned by the API's volume endpoints. */
export interface Volume {
  /** Current level in dB, as confirmed by the receiver. */
  db: number;
  /** The receiver's own 0-100 scale, where percent === db + 90. */
  percent: number;
  muted: boolean;
  /** The API's safety ceiling. The dial treats this as its 100%. */
  maxDb: number;
}

/**
 * The receiver's full volume range, in dB. Its own percent scale is exactly
 * `dB + 90` across this span, so the dial reads the same number the receiver does.
 * Mirrors minVolumeDb / deviceMaxVolumeDb in the API config.
 */
export const MIN_DB = -90;
export const MAX_DB = 10;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? response.statusText, response.status);
  }

  return response.json() as Promise<T>;
}

export interface Power {
  power: boolean;
}

export interface InputOption {
  input: number;
  name: string;
}

export interface Inputs {
  inputs: InputOption[];
  selected: number | null;
  /** Format of the arriving signal, e.g. "Dolby D+" or "No Signal". */
  format: string | null;
}

export interface SpeakerProfile {
  /** 1-based slot number, as shown in the receiver's setup. */
  profile: number;
  /** What the wire expects: 0 selects profile 1. */
  value: number;
  name: string;
}

export interface SpeakerProfiles {
  profiles: SpeakerProfile[];
  /** Speaker profile is a per-input setting, so this says which input it applies to. */
  input: number;
  inputName: string;
  selected: number | null;
}

export interface DisplayOption {
  value: number;
  label: string;
}

export interface Display {
  /** Front panel displayed info: 0 = All, 1 = Volume Only. */
  info: number | null;
  options: DisplayOption[];
}

export const getVolume = () => request<Volume>('/api/volume');

export const getDisplay = () => request<Display>('/api/display');

export const setDisplay = (info: number) =>
  request<Display>('/api/display', { method: 'PUT', body: JSON.stringify({ info }) });

export const getSpeakerProfiles = () => request<SpeakerProfiles>('/api/speaker-profiles');

export const setSpeakerProfile = (profile: number) =>
  request<{ input: number; selected: number | null }>('/api/speaker-profile', {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });

export const getInputs = () => request<Inputs>('/api/inputs');

export const selectInput = (input: number) =>
  request<{ selected: number | null }>('/api/input', {
    method: 'PUT',
    body: JSON.stringify({ input }),
  });

export const getPower = () => request<Power>('/api/power');

export const setPower = (power: boolean) =>
  request<Power>('/api/power', { method: 'PUT', body: JSON.stringify({ power }) });

/** One step is 1 dB. Negative steps go down. */
export const stepVolume = (steps: number) =>
  request<Volume>('/api/volume/step', { method: 'POST', body: JSON.stringify({ steps }) });
