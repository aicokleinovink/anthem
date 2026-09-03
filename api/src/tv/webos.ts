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
  /** OLED pixel brightness, 0-100, or null before the set has been asked. */
  backlight: number | null = null;

  #socket?: WebSocket;
  #nextId = 0;
  #pending = new Map<string, (payload: Record<string, unknown>) => void>();
  #retry?: NodeJS.Timeout;
  #stopped = false;
  /** The second socket the remote keys go to; opened on the first press. */
  #input?: Promise<WebSocket>;
  /** Where brightness is heading, while a write is on its way to the set. */
  #backlightTarget: number | null = null;
  #writingBacklight = false;
  /** How long to leave the set alone before confirming. Shortened in tests. */
  protected backlightConfirmMs = BACKLIGHT_CONFIRM_MS;

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

    /*
     * No pacing, and that is a measurement rather than an omission.
     *
     * The receiver silently drops commands sent back-to-back, so this was paced 60ms
     * apart on the assumption that the TV would too. It does not: five frames written
     * to the input socket inside 1ms all landed, counted a tile at a time on the home
     * screen. Whoever adds a press-and-hold repeat should measure again — that sends
     * far more than five — but for the taps this app makes, the gap bought nothing.
     */
    // Newline-delimited text, not JSON, and the blank line at the end is required.
    await this.writeKeyFrame(`type:button\nname:${TV_KEYS[key]}\n\n`);
  }

  /** The frame going out on the input socket. Overridden in tests to record it. */
  protected async writeKeyFrame(frame: string): Promise<void> {
    const socket = await this.#inputSocket();
    socket.send(frame);
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

  /**
   * OLED pixel brightness — `backlight` in the set's `picture` category.
   *
   * Reading is an ordinary request. Note that the `keys` array must contain only keys
   * the category actually has: one bad name fails the whole request with a `500`, which
   * looks like the service is broken rather than like a typo.
   */
  async readBacklight(): Promise<number | null> {
    if (!this.available) return null;
    const answer = await this.#request('ssap://settings/getSystemSettings', {
      category: 'picture',
      keys: ['backlight'],
    });
    const settings = answer.settings as { backlight?: unknown } | undefined;
    const value = Number(settings?.backlight);
    if (!Number.isFinite(value)) return null;
    this.backlight = value;
    return value;
  }

  /**
   * Step the brightness, which is the only way this is offered.
   *
   * Not an absolute level, and not one write per press. Presses arrive faster than the
   * bridge below can carry them, so they *accumulate*: each one moves the target, and
   * one write at a time goes out carrying wherever the target has got to. Three quick
   * presses become one write of −30 rather than three writes that each read the same
   * stale value from the set and land on −10.
   */
  async stepBacklight(steps: number): Promise<void> {
    if (!this.available) throw new Error('TV is not reachable');

    // The pending target first: while a write is in flight the set still reports the
    // old value, and basing a second press on that is exactly how presses got lost.
    const base = this.#backlightTarget ?? this.backlight ?? (await this.readBacklight());
    if (base === null) throw new Error('TV would not report its picture settings');

    const target = Math.round(Math.min(100, Math.max(0, base + steps)));
    // Already there: pressing brighter at 100 would otherwise put an alert on the
    // screen to write the value the set already holds.
    if (target === base) return;

    this.#backlightTarget = target;
    // Show the intent at once; the set is asked for the truth further down.
    this.backlight = target;
    this.emit('changed');

    // A write is already draining the target, and will pick this up when it loops.
    if (this.#writingBacklight) return;

    this.#writingBacklight = true;
    try {
      /*
       * Drain, settle, and go round again if anything arrived while settling.
       *
       * The settling wait is why the outer loop has to exist. The set applies a change
       * a beat after the alert closes, so a read taken straight afterwards returns the
       * *old* value — which then goes out on the stream and yanks the number on screen
       * back. But a press landing during that wait finds `#writingBacklight` still set
       * and returns without writing, so if the loop had already ended, its target was
       * never written and every client was left showing a value the TV did not have.
       */
      while (this.#backlightTarget !== null) {
        while (this.#backlightTarget !== null) {
          const value = this.#backlightTarget;
          this.#backlightTarget = null;
          await this.writeBacklight(value);
        }
        await new Promise((resolve) => setTimeout(resolve, this.backlightConfirmMs));
      }

      // Only now, with nothing outstanding, is the set's own number worth asking for.
      await this.readBacklight();
      this.emit('changed');
    } catch (error) {
      /*
       * A target was published that never landed. Ask the set what it actually holds
       * rather than leaving every client showing the write we failed to make — and if
       * even that cannot be read, show nothing instead of a number that is wrong.
       */
      this.#backlightTarget = null;
      try {
        await this.readBacklight();
      } catch {
        this.backlight = null;
      }
      this.emit('changed');
      throw error;
    } finally {
      this.#writingBacklight = false;
    }
  }

  /**
   * One write, which the set will not simply let us do.
   *
   * `ssap://settings/setSystemSettings` answers `401` even with `WRITE_SETTINGS`
   * granted: picture writes are reserved for the TV's own apps. What does work — probed
   * on the real set — is to have the TV make the change *itself*: an alert carries a
   * `luna://` action, and closing the alert fires it. The alert's message is a space and
   * it is closed immediately, so nothing readable appears on screen.
   *
   * This is a hack on a private interface, and LG can take it away in a firmware update.
   * If they do, the failure is this throwing, not the app misbehaving — and the d-pad
   * remains a way to reach the same setting the long way round.
   */
  protected async writeBacklight(value: number): Promise<void> {
    const uri = 'luna://com.webos.settingsservice/setSystemSettings';
    // Strings: the settings service takes the value as text even though it reads back
    // as a number.
    const params = { category: 'picture', settings: { backlight: String(value) } };

    const alert = await this.#request('ssap://system.notifications/createAlert', {
      message: ' ',
      buttons: [{ label: '', onClick: uri, params }],
      onclose: { uri, params },
      onfail: { uri, params },
    });
    const alertId = alert.alertId;
    if (typeof alertId !== 'string') {
      throw new Error('TV would not take the picture setting');
    }
    await this.#request('ssap://system.notifications/closeAlert', { alertId });
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
      this.backlight = null;
      this.#backlightTarget = null;
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
      /*
       * Picture settings have no subscription here, so this is read once on connect and
       * again after each write. Changing brightness with the TV's own remote will not
       * show up until then — the card is honest about what it last read, which is the
       * best available and worth knowing before trusting the number.
       */
      void this.readBacklight()
        .then(() => this.emit('changed'))
        .catch(() => {
          // An un-repaired key cannot read settings; the card simply shows nothing.
        });
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
 * How long to leave the set alone before asking what brightness it ended up on. The
 * change lands a moment after the alert closes; reading sooner returns the old value.
 */
const BACKLIGHT_CONFIRM_MS = 700;
