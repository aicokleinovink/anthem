import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { ACTIONS, parseStatus, seekUrl, type Action, type NowPlaying } from './bluos.js';

/** How long the Node holds a status request open waiting for a change. */
const LONG_POLL_SECONDS = 60;

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * Follows what the streamer is playing.
 *
 * The Node supports long-polling: ask for the status with the etag you last saw and it
 * holds the request open until something actually changes. So this never polls in the
 * busy sense — it sits waiting, and reports the moment a track changes or the position
 * moves, which is what lets the UI stay live without asking.
 */
export class Player extends EventEmitter {
  now: NowPlaying | null = null;
  reachable = false;

  #etag: string | null = null;
  #retry = RETRY_MIN_MS;
  #stopped = false;
  #timer?: NodeJS.Timeout;

  constructor(private readonly baseUrl = config.playerUrl) {
    super();
  }

  start(): void {
    if (!this.baseUrl) return;
    this.#stopped = false;
    void this.#follow();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }

  async act(action: Action): Promise<void> {
    if (!this.baseUrl) throw new Error('No streamer configured');
    const response = await fetch(`${this.baseUrl}${ACTIONS[action]}`);
    if (!response.ok) throw new Error(`Streamer rejected ${action}: ${response.status}`);
  }

  /**
   * Jump to a position in the current track.
   *
   * The Node reports the new position on its own status a moment later, like every other
   * transport action, so nothing is echoed back here.
   */
  async seek(seconds: number): Promise<void> {
    if (!this.baseUrl) throw new Error('No streamer configured');
    const response = await fetch(`${this.baseUrl}${seekUrl(seconds)}`);
    if (!response.ok) throw new Error(`Streamer rejected seek: ${response.status}`);
  }

  async #follow(): Promise<void> {
    while (!this.#stopped) {
      try {
        const query = this.#etag
          ? `?timeout=${LONG_POLL_SECONDS}&etag=${encodeURIComponent(this.#etag)}`
          : '';
        const response = await fetch(`${this.baseUrl}/Status${query}`);
        if (!response.ok) throw new Error(`status ${response.status}`);

        const { now, etag } = parseStatus(await response.text(), this.baseUrl);
        this.#etag = etag;
        this.#retry = RETRY_MIN_MS;

        const changed = JSON.stringify(now) !== JSON.stringify(this.now);
        this.now = now;
        this.reachable = true;
        if (changed) this.emit('changed');
      } catch (error) {
        if (this.#stopped) return;
        const wasReachable = this.reachable;
        this.reachable = false;
        this.#etag = null;
        if (wasReachable) {
          console.error(`[anthem] streamer unreachable: ${(error as Error).message}`);
          this.emit('changed');
        }
        await new Promise((resolve) => {
          this.#timer = setTimeout(resolve, this.#retry);
        });
        this.#retry = Math.min(this.#retry * 2, RETRY_MAX_MS);
      }
    }
  }
}
