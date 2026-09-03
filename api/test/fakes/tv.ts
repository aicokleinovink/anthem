import type { TvKey } from '../../src/tv/keys.js';
import { WebosTv } from '../../src/tv/webos.js';

/**
 * A stand-in LG set. Like the streamer, the real thing is a socket protocol whose
 * parsing is not what an end-to-end test is trying to prove; what matters is that the
 * UI dispatches to the TV rather than to the receiver, and that is visible here.
 */
export class FakeTv extends WebosTv {
  /** Every target the app asked the TV to switch to, in order. */
  readonly selections: string[] = [];
  /** Every remote key the app pressed, in order. */
  readonly keys: TvKey[] = [];
  /** Every brightness the app wrote, in order. */
  readonly backlights: number[] = [];

  constructor() {
    // No host or client key, so the real WebSocket is never opened.
    super('', '');
    this.available = true;
    this.current = 'netflix';
    // A real set always has a value here; 100 is where this one was found.
    this.backlight = 100;
  }

  override start(): void {}

  override stop(): void {}

  override async select(key: string): Promise<void> {
    if (!this.targets.some((target) => target.key === key)) {
      throw new Error(`Unknown TV target: ${key}`);
    }
    this.selections.push(key);
    // The real set reports the change back on its own subscription a moment later.
    this.current = key;
    this.emit('changed');
  }

  /*
   * The real thing sends these to a second socket the set hands out per session; there
   * is nothing to read back either way, so recording the press is the whole of it.
   */
  override async sendKey(key: TvKey): Promise<void> {
    if (!this.available) throw new Error('TV is not reachable');
    this.keys.push(key);
  }

  override async readBacklight(): Promise<number | null> {
    return this.available ? this.backlight : null;
  }

  /*
   * The real thing cannot be written to at all directly — the value goes through an
   * alert carrying a luna:// action, and the set takes a moment to apply it. None of
   * that is what a UI test proves, so this records where each press landed and moves on.
   * The coalescing that matters is the real class's, and this deliberately does not
   * reproduce it: a test asserting on `backlights` is asserting on what the app asked
   * for.
   */
  override async stepBacklight(steps: number): Promise<void> {
    if (!this.available) throw new Error('TV is not reachable');
    const base = this.backlight ?? 100;
    this.backlight = Math.round(Math.min(100, Math.max(0, base + steps)));
    this.backlights.push(this.backlight);
    this.emit('changed');
  }

  /** Report the set turning off, or landing on something, without a command. */
  set(available: boolean, current: string | null): void {
    this.available = available;
    this.current = current;
    /*
     * A set that cannot be reached reports nothing; one that can always has a value.
     * Without the second half of that, a test that switched the TV off left every later
     * test looking at a card with no brightness to show — which is how this was found.
     */
    if (!available) this.backlight = null;
    else this.backlight ??= 100;
    this.emit('changed');
  }
}
