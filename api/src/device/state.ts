import { TONE_CONTROLS, TONE_KEYS, type ToneControl, type Zone } from '../protocol/commands.js';
import { toBoolean, toNumber, type Message } from '../protocol/parse.js';

export interface ZoneState {
  power?: boolean;
  volumeDb?: number;
  volumePercent?: number;
  muted?: boolean;
  input?: number;
  listeningMode?: number;
  audioFormat?: string;
  /** Bass, treble and subwoofer trim, in dB. See device/tone.ts for the range. */
  tone: Partial<Record<ToneControl, number>>;
}

export interface ReceiverState {
  connected: boolean;
  model?: string;
  software?: string;
  region?: string;
  inputCount?: number;
  /** Front panel displayed info: 0 = All, 1 = Volume Only. */
  frontPanelInfo?: number;
  inputNames: Record<number, string>;
  /** Speaker profile names, keyed by 1-based profile number. */
  profileNames: Record<number, string>;
  /** Speaker profile assigned to each input, as the receiver's 0-based value. */
  inputProfiles: Record<number, number>;
  zones: Record<Zone, ZoneState>;
}

export function emptyState(): ReceiverState {
  return {
    connected: false,
    inputNames: {},
    profileNames: {},
    inputProfiles: {},
    zones: { 1: { tone: {} }, 2: { tone: {} } },
  };
}

/**
 * Fold one parsed frame into the cache. Applied to every frame the receiver sends —
 * replies to our own commands and unsolicited pushes alike — so the cache stays
 * correct when someone reaches for the physical remote.
 */
export function applyMessage(state: ReceiverState, message: Message): ReceiverState {
  if (message.kind === 'zone') {
    const zone = state.zones[message.zone];
    switch (message.key) {
      case 'POW':
        zone.power = toBoolean(message.value);
        break;
      case 'VOL':
        zone.volumeDb = toNumber(message.value);
        break;
      case 'PVOL':
        zone.volumePercent = toNumber(message.value);
        break;
      case 'MUT':
        zone.muted = toBoolean(message.value);
        break;
      case 'INP':
        zone.input = toNumber(message.value);
        break;
      case 'ALM':
        zone.listeningMode = toNumber(message.value);
        break;
      case 'AIN':
        zone.audioFormat = message.value;
        break;
      case 'TON0':
      case 'TON1':
      case 'LEV1': {
        const control = TONE_CONTROLS.find((name) => TONE_KEYS[name] === message.key);
        const value = toNumber(message.value);
        if (control !== undefined && value !== undefined) zone.tone[control] = value;
        break;
      }
      // VUP / VDN are commands only; the receiver answers them with a VOL frame.
      default:
        break;
    }
    return state;
  }

  if (message.kind === 'global') {
    switch (message.key) {
      case 'IDM':
        state.model = message.value;
        break;
      case 'IDS':
        state.software = message.value;
        break;
      case 'IDR':
        state.region = message.value;
        break;
      case 'ICN':
        state.inputCount = toNumber(message.value);
        break;
      case 'GCFPDI':
        state.frontPanelInfo = toNumber(message.value);
        break;
      default:
        break;
    }
    return state;
  }

  if (message.kind === 'inputName') {
    state.inputNames[message.input] = message.value;
  }

  if (message.kind === 'profileName') {
    state.profileNames[message.profile] = message.value;
  }

  if (message.kind === 'inputProfile') {
    const value = toNumber(message.value);
    if (value !== undefined) state.inputProfiles[message.input] = value;
  }

  return state;
}
