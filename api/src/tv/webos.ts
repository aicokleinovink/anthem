import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { TV_TARGETS, type TvTarget } from './targets.js';

/**
 * An LG webOS television, over its local SSAP protocol: JSON on a WebSocket, no cloud
 * and no LG account. The first connection makes the TV show a prompt; accepting it
 * returns a client key, which every later connection presents instead.
 *
 * The TV cannot be woken this way — with the set off there is no network stack to talk
 * to. That needs Wake-on-LAN, which is a different thing entirely.
 */
export class WebosTv extends EventEmitter {
  available = false;
  /** Which of TV_TARGETS is on screen, if any. */
  current: string | null = null;

  #socket?: WebSocket;
  #nextId = 0;
  #pending = new Map<string, (payload: Record<string, unknown>) => void>();
  #retry?: NodeJS.Timeout;
  #stopped = false;

  constructor(
    private readonly host = config.tvHost,
    private readonly clientKey = config.tvClientKey,
  ) {
    super();
  }

  start(): void {
    if (!this.host || !this.clientKey) {
      console.log('[anthem] no TV configured — skipping the TV section');
      return;
    }
    this.#stopped = false;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#retry);
    this.#socket?.close();
  }

  get targets(): TvTarget[] {
    return TV_TARGETS;
  }

  /** Switch to one of the configured targets. */
  async select(key: string): Promise<void> {
    const target = TV_TARGETS.find((entry) => entry.key === key);
    if (!target) throw new Error(`Unknown TV target: ${key}`);
    if (!this.available) throw new Error('TV is not reachable');

    // Inputs and apps are both launched; only the payload differs.
    await this.#request(
      target.kind === 'input'
        ? 'ssap://tv/switchInput'
        : 'ssap://com.webos.applicationManager/launch',
      target.kind === 'input' ? { inputId: target.id } : { id: target.id },
    );
  }

  #connect(): void {
    const socket = new WebSocket(`ws://${this.host}:3000`);
    this.#socket = socket;

    socket.onopen = () => {
      const payload: Record<string, unknown> = {
        forcePairing: false,
        pairingType: 'PROMPT',
        manifest: MANIFEST,
      };
      payload['client-key'] = this.clientKey;
      socket.send(JSON.stringify({ type: 'register', id: 'register', payload }));
    };

    socket.onmessage = (event) => this.#onMessage(String(event.data));
    socket.onerror = (event: Event & { message?: string }) => {
      console.error(`[anthem] TV socket error: ${event.message ?? 'unreachable'}`);
    };
    socket.onclose = () => {
      const was = this.available;
      this.available = false;
      this.current = null;
      this.#pending.clear();
      if (was) this.emit('changed');
      if (!this.#stopped) this.#retry = setTimeout(() => this.#connect(), RETRY_MS);
    };
  }

  #onMessage(raw: string): void {
    const message = JSON.parse(raw) as {
      type: string;
      id?: string;
      payload?: Record<string, unknown>;
    };

    if (message.type === 'registered') {
      this.available = true;
      console.log(`[anthem] TV connected at ${this.host}`);
      this.emit('changed');
      // Ask to be told what is on screen, rather than asking again and again.
      this.#subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo');
      return;
    }

    if (message.id && this.#pending.has(message.id)) {
      this.#pending.get(message.id)?.(message.payload ?? {});
      this.#pending.delete(message.id);
    }

    if (message.id === 'foreground' && message.payload) {
      const appId = String(message.payload.appId ?? '');
      const next = TV_TARGETS.find((target) => target.foregroundId === appId)?.key ?? null;
      if (next !== this.current) {
        this.current = next;
        this.emit('changed');
      }
    }
  }

  #subscribe(uri: string): void {
    this.#socket?.send(JSON.stringify({ type: 'subscribe', id: 'foreground', uri }));
  }

  #request(uri: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const socket = this.#socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('TV is not connected'));
        return;
      }

      const id = `req${++this.#nextId}`;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`TV did not answer ${uri}`));
      }, 5000);

      this.#pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });

      socket.send(JSON.stringify({ type: 'request', id, uri, payload }));
    });
  }
}

const RETRY_MS = 10_000;

/**
 * The registration manifest. LG's own app sends a signed one; a plain manifest is
 * enough for prompt-based pairing, which is why this needs no extra dependency.
 */
const MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.1',
  signed: {
    created: '20140509',
    appId: 'com.anthem.remote',
    vendorId: 'com.anthem',
    localizedAppNames: { '': 'Anthem Remote' },
    localizedVendorNames: { '': 'Anthem Remote' },
    permissions: ['TEST_SECURE'],
    serial: '2f930e2d2cfe083771f68e4fe7bb07',
  },
  permissions: [
    'LAUNCH',
    'CONTROL_AUDIO',
    'CONTROL_POWER',
    'READ_INSTALLED_APPS',
    'READ_RUNNING_APPS',
    'CONTROL_INPUT_TV',
    'READ_INPUT_DEVICE_LIST',
    'WRITE_NOTIFICATION_TOAST',
  ],
};
