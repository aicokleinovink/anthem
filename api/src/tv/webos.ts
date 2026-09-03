import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { TV_KEYS, type TvKey } from './keys.js';
import { TV_MANIFEST } from './manifest.js';
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
  /** The second socket the remote keys go to; opened on the first press. */
  #input?: Promise<WebSocket>;
  /** When the last key went out, so presses can be paced rather than dumped. */
  #lastKeyAt = 0;

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

  /**
   * Press a key, as the physical remote would.
   *
   * Directional keys are not part of SSAP's request surface: the set hands out a
   * separate WebSocket for them, whose address it only gives out per session — so the
   * socket is opened on the first press and thrown away with the connection.
   */
  async sendKey(key: TvKey): Promise<void> {
    if (!this.available) throw new Error('TV is not reachable');

    const socket = await this.#inputSocket();

    /*
     * Paced, like the receiver's writes. Whether this set drops keys sent back-to-back
     * is not established — the probe that was meant to answer it ran inside a video
     * player, where the d-pad seeks instead of moving a highlight, so nothing was
     * countable. A held-down arrow is the case that would expose it. The gap is cheap
     * insurance until somebody counts tiles on the home screen; if it turns out to be
     * unnecessary, deleting it is a one-line change.
     */
    const gap = KEY_GAP_MS - (Date.now() - this.#lastKeyAt);
    if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
    this.#lastKeyAt = Date.now();

    // Newline-delimited text, not JSON, and the blank line at the end is required.
    socket.send(`type:button\nname:${TV_KEYS[key]}\n\n`);
  }

  /** The input socket, opened once per connection and shared by every press. */
  #inputSocket(): Promise<WebSocket> {
    if (this.#input) return this.#input;

    this.#input = (async () => {
      const answer = await this.#request(
        'ssap://com.webos.service.networkinput/getPointerInputSocket',
        {},
      );
      const path = answer.socketPath;
      if (typeof path !== 'string') {
        /*
         * What a key paired before `CONTROL_MOUSE_AND_KEYBOARD` was in the manifest
         * gets: `401 insufficient permissions`. Say so plainly — the fix is a re-pair,
         * not a code change, and the error surfaces in the UI.
         */
        throw new Error('TV would not give out an input socket — re-pair with `npm run pair-tv`');
      }

      const socket = new WebSocket(path);
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('TV input socket would not open'));
      });
      // A dead input socket must not be handed to the next press.
      socket.onclose = () => {
        if (this.#input === promise) this.#input = undefined;
      };
      return socket;
    })();

    const promise = this.#input;
    // A failed attempt is not cached; the next press tries again.
    promise.catch(() => {
      if (this.#input === promise) this.#input = undefined;
    });
    return promise;
  }

  #connect(): void {
    const socket = new WebSocket(`ws://${this.host}:3000`);
    this.#socket = socket;

    socket.onopen = () => {
      const payload: Record<string, unknown> = {
        forcePairing: false,
        pairingType: 'PROMPT',
        manifest: TV_MANIFEST,
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
      // Its address was only valid for this session.
      void this.#input?.then((input) => input.close()).catch(() => {});
      this.#input = undefined;
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

/** Minimum spacing between two key presses on the input socket. See `sendKey`. */
const KEY_GAP_MS = 60;
