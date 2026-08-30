import net from 'node:net';
import { once } from 'node:events';

/**
 * A fake MRX 540 speaking the real ASCII protocol over TCP, so the app's transport,
 * parser and command builders all stay in the tested path. Tests can then assert on
 * the bytes that actually went out — `Z1PVOL`, not `Z1VOL`.
 *
 * Two behaviours of the real unit are reproduced on purpose, because they are the ones
 * the code exists to work around:
 *
 * 1. **Every change is broadcast to every client**, not just to whoever asked. That is
 *    what lets the UI stop polling, so the fake has to do it or the event stream would
 *    be tested against something easier than the hardware.
 * 2. **`Z1VOL<n>` is not a working setter.** On the real receiver it moves the level
 *    somewhere unrelated and unreproducible; here it simply does not move at all and
 *    reports the unchanged level. Either way a client that writes `Z1VOL` instead of
 *    `Z1PVOL` fails to set the volume, which is the point.
 */

/** The state the fake reports, seeded to match the real unit this was built against. */
export interface FakeReceiverState {
  model: string;
  software: string;
  region: string;
  power: Record<number, boolean>;
  volumeDb: Record<number, number>;
  muted: Record<number, boolean>;
  input: number;
  audioFormat: string;
  /** 1-based: `inputNames[1]` is input 1. */
  inputNames: Record<number, string>;
  /** 1-based slots, holding the names the receiver reports. */
  profileNames: Record<number, string>;
  /** Per input, the receiver's **0-based** profile value: 0 selects profile 1. */
  inputProfiles: Record<number, number>;
  /** Front panel displayed info: 0 All, 1 Volume Only. */
  frontPanelInfo: number;
}

function initialState(): FakeReceiverState {
  return {
    model: 'MRX 540',
    software: '00.80',
    region: '2',
    power: { 1: true, 2: false },
    volumeDb: { 1: -77, 2: -90 },
    muted: { 1: false, 2: false },
    input: 3,
    audioFormat: 'Dolby D+',
    inputNames: { 1: 'HDMI 1', 2: 'Airplay', 3: 'TV / PlayStation', 4: 'Streamer' },
    // Two named, two never renamed — the case the settings card filters.
    profileNames: { 1: 'Center', 2: 'Corner', 3: 'Profile3', 4: 'Profile4' },
    inputProfiles: { 1: 0, 2: 0, 3: 1, 4: 0 },
    frontPanelInfo: 0,
  };
}

/** Percent and dB are the same scale on this unit: percent === dB + 90. */
const dbToPercent = (db: number) => Math.round(db + 90);
const percentToDb = (percent: number) => percent - 90;

const VOLUME_MIN_DB = -90;
const VOLUME_MAX_DB = 10;

const clampDb = (db: number) => Math.min(Math.max(db, VOLUME_MIN_DB), VOLUME_MAX_DB);

/** How the receiver writes a level: one decimal, e.g. `-77.0`. */
const db = (value: number) => value.toFixed(1);

export interface FakeReceiver {
  port: number;
  state: FakeReceiverState;
  /** Every command the fake has been sent, in order, terminator included. */
  readonly received: string[];
  /** Send raw frames to every connected client, as the front panel would. */
  push: (...frames: string[]) => void;
  clear: () => void;
  close: () => Promise<void>;
}

export async function startFakeReceiver(host = '127.0.0.1'): Promise<FakeReceiver> {
  const state = initialState();
  const received: string[] = [];
  const sockets = new Set<net.Socket>();

  const broadcast = (frames: string[]) => {
    const payload = frames.map((frame) => `${frame};`).join('');
    for (const socket of sockets) socket.write(payload);
  };

  /** Reply to one command: `to` is the asker, or every client for a state change. */
  const handle = (command: string, socket: net.Socket): void => {
    const reply = (frames: string[], everyone = false) => {
      if (frames.length === 0) return;
      if (everyone) broadcast(frames);
      else socket.write(frames.map((frame) => `${frame};`).join(''));
    };

    const body = command.slice(0, -1); // drop the ';'

    // --- global ----------------------------------------------------------
    if (body === 'IDM?') return reply([`IDM${state.model}`]);
    if (body === 'IDS?') return reply([`IDS${state.software}`]);
    if (body === 'IDR?') return reply([`IDR${state.region}`]);
    if (body === 'ICN?') return reply([`ICN${Object.keys(state.inputNames).length}`]);

    if (body === 'GCFPDI?') return reply([`GCFPDI${state.frontPanelInfo}`]);
    const frontPanel = /^GCFPDI([01])$/.exec(body);
    if (frontPanel) {
      state.frontPanelInfo = Number(frontPanel[1]);
      return reply([`GCFPDI${state.frontPanelInfo}`], true);
    }

    // --- input names and per-input speaker profiles -----------------------
    const inputName = /^IS(\d+)IN\?$/.exec(body);
    if (inputName) {
      const input = Number(inputName[1]);
      return reply([`IS${input}IN${state.inputNames[input] ?? `Input ${input}`}`]);
    }

    const profileQuery = /^IS(\d+)SP\?$/.exec(body);
    if (profileQuery) {
      const input = Number(profileQuery[1]);
      return reply([`IS${input}SP${state.inputProfiles[input] ?? 0}`]);
    }

    const profileSet = /^IS(\d+)SP(\d+)$/.exec(body);
    if (profileSet) {
      const input = Number(profileSet[1]);
      const value = Number(profileSet[2]);
      state.inputProfiles[input] = value;
      return reply([`IS${input}SP${value}`], true);
    }

    const profileName = /^SSSP(\d+)0\?$/.exec(body);
    if (profileName) {
      const profile = Number(profileName[1]);
      return reply([`SSSP${profile}0${state.profileNames[profile] ?? `Profile${profile}`}`]);
    }

    // --- zone -------------------------------------------------------------
    const zoned = /^Z([12])(PVOL|POW|VOL|VUP|VDN|MUT|INP|AIN)(.*)$/.exec(body);
    if (zoned) {
      const zone = Number(zoned[1]);
      const key = zoned[2];
      const value = zoned[3] ?? '';
      const level = () => [`Z${zone}PVOL${dbToPercent(state.volumeDb[zone] ?? VOLUME_MIN_DB)}`,
        `Z${zone}VOL${db(state.volumeDb[zone] ?? VOLUME_MIN_DB)}`];

      switch (key) {
        case 'POW':
          if (value === '?') return reply([`Z${zone}POW${state.power[zone] ? 1 : 0}`]);
          if (value === '0' || value === '1') {
            state.power[zone] = value === '1';
            return reply([`Z${zone}POW${value}`], true);
          }
          break;

        case 'VOL':
          if (value === '?') return reply([`Z${zone}VOL${db(state.volumeDb[zone] ?? VOLUME_MIN_DB)}`]);
          // Not a setter on the real unit. Answer with the level it did NOT move to.
          return reply([`Z${zone}VOL${db(state.volumeDb[zone] ?? VOLUME_MIN_DB)}`]);

        case 'PVOL':
          if (value === '?') return reply([`Z${zone}PVOL${dbToPercent(state.volumeDb[zone] ?? VOLUME_MIN_DB)}`]);
          if (/^\d+$/.test(value)) {
            state.volumeDb[zone] = clampDb(percentToDb(Number(value)));
            return reply(level(), true);
          }
          break;

        case 'VUP':
        case 'VDN':
          // These take NO argument; `Z1VUP1;` is rejected by the real receiver.
          if (value !== '') break;
          state.volumeDb[zone] = clampDb(
            (state.volumeDb[zone] ?? VOLUME_MIN_DB) + (key === 'VUP' ? 1 : -1),
          );
          return reply(level(), true);

        case 'MUT':
          if (value === '?') return reply([`Z${zone}MUT${state.muted[zone] ? 1 : 0}`]);
          if (value === 't') state.muted[zone] = !state.muted[zone];
          else if (value === '0' || value === '1') state.muted[zone] = value === '1';
          else break;
          return reply([`Z${zone}MUT${state.muted[zone] ? 1 : 0}`], true);

        case 'INP':
          if (value === '?') return reply([`Z${zone}INP${state.input}`]);
          if (/^\d+$/.test(value)) {
            state.input = Number(value);
            return reply([`Z${zone}INP${state.input}`], true);
          }
          break;

        case 'AIN':
          if (value === '?') return reply([`Z${zone}AIN${state.audioFormat}`]);
          break;
      }
    }

    // The receiver prefixes anything it will not accept with '!I'.
    reply([`!I${body}`]);
  };

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split(';');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (part.length === 0) continue;
        const command = `${part};`;
        received.push(command);
        handle(command, socket);
      }
    });

    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });

  server.listen(0, host);
  await once(server, 'listening');
  const { port } = server.address() as net.AddressInfo;

  return {
    port,
    state,
    received,
    push: (...frames: string[]) => broadcast(frames),
    clear: () => {
      received.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
