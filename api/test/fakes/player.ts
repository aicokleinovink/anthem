import { Player } from '../../src/player/player.js';
import type { NowPlaying } from '../../src/player/bluos.js';

/**
 * A stand-in streamer. The Node talks HTTP long-poll, and standing up a fake BluOS
 * server would exercise a parser that `player.test.ts` already covers directly — so
 * this replaces the class instead, and just reports what a test tells it to.
 */
export class FakePlayer extends Player {
  /** Every transport action the app asked for, in order. */
  readonly actions: string[] = [];

  constructor() {
    // No base URL, so the real long-poll loop never starts.
    super('');
  }

  override start(): void {}

  override stop(): void {}

  override async act(action: 'play' | 'pause' | 'next' | 'previous'): Promise<void> {
    this.actions.push(action);
  }

  /** Logged with its position, since where it seeked to is the whole point. */
  override async seek(seconds: number): Promise<void> {
    this.actions.push(`seek:${seconds}`);
  }

  /** Report a track — the same event the long-poll would have produced. */
  set(now: NowPlaying | null): void {
    this.now = now;
    this.reachable = now !== null;
    this.emit('changed');
  }
}
