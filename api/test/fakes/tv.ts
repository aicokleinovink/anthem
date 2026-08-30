import { WebosTv } from '../../src/tv/webos.js';

/**
 * A stand-in LG set. Like the streamer, the real thing is a socket protocol whose
 * parsing is not what an end-to-end test is trying to prove; what matters is that the
 * UI dispatches to the TV rather than to the receiver, and that is visible here.
 */
export class FakeTv extends WebosTv {
  /** Every target the app asked the TV to switch to, in order. */
  readonly selections: string[] = [];

  constructor() {
    // No host or client key, so the real WebSocket is never opened.
    super('', '');
    this.available = true;
    this.current = 'netflix';
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

  /** Report the set turning off, or landing on something, without a command. */
  set(available: boolean, current: string | null): void {
    this.available = available;
    this.current = current;
    this.emit('changed');
  }
}
