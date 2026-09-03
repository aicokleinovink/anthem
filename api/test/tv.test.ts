import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WebosTv } from '../src/tv/webos.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The set, with the two things that actually reach it replaced: the alert bridge that
 * carries a brightness, and the frame that goes out on the input socket. Both are
 * `protected` on `WebosTv` for exactly this — the bugs these tests cover are about
 * *timing and ordering* around those calls, which no amount of testing the payloads
 * would have caught.
 */
class TestTv extends WebosTv {
  readonly writes: number[] = [];
  readonly frames: Array<{ frame: string; at: number }> = [];
  /** What the set would report if asked. */
  reported: number | null = 100;
  /** Refuse the next bridge write, as a set with the hack removed would. */
  refuseWrites = false;
  readable = true;

  protected override backlightConfirmMs = 20;

  constructor() {
    super('', '');
    this.available = true;
    this.backlight = 100;
  }

  override async readBacklight(): Promise<number | null> {
    if (!this.readable) throw new Error('cannot read');
    this.backlight = this.reported;
    return this.reported;
  }

  protected override async writeBacklight(value: number): Promise<void> {
    if (this.refuseWrites) throw new Error('401 insufficient permissions');
    this.writes.push(value);
    this.reported = value;
  }

  protected override async writeKeyFrame(frame: string): Promise<void> {
    this.frames.push({ frame, at: Date.now() });
  }
}

describe('brightness', () => {
  it('writes a press that arrives while the last one is settling', async () => {
    const tv = new TestTv();

    // The first press drains immediately and then sits in its settling wait. The
    // second lands inside that wait, which is where it used to be dropped: the drain
    // loop had ended, so nothing picked its target up and the set kept the old value
    // while every client showed the new one.
    const first = tv.stepBacklight(-10);
    await sleep(5);
    const second = tv.stepBacklight(-10);
    await Promise.all([first, second]);

    assert.deepEqual(tv.writes, [90, 80]);
    assert.equal(tv.backlight, 80);
  });

  it('accumulates presses that arrive while a write is in flight', async () => {
    const tv = new TestTv();
    await Promise.all([tv.stepBacklight(-10), tv.stepBacklight(-10), tv.stepBacklight(-10)]);

    // Forty points asked for, and the set ends there however many writes it took —
    // what must not happen is three writes each computing -10 from the same value.
    assert.equal(tv.backlight, 70);
    assert.equal(tv.writes.at(-1), 70);
  });

  it('leaves no value the set does not have when the write is refused', async () => {
    const tv = new TestTv();
    tv.refuseWrites = true;

    await assert.rejects(() => tv.stepBacklight(-40));

    // The optimistic 60 was published before the write was attempted; what the set
    // actually holds is 100, and that is what clients must be told.
    assert.equal(tv.backlight, 100);
    assert.deepEqual(tv.writes, []);
  });

  it('shows nothing rather than a wrong number when it cannot even read back', async () => {
    const tv = new TestTv();
    tv.refuseWrites = true;
    tv.readable = false;

    await assert.rejects(() => tv.stepBacklight(-40));
    assert.equal(tv.backlight, null);
  });

  it('does not write a step that lands where the set already is', async () => {
    const tv = new TestTv();

    // At the top of the scale: the buttons disable there, but the route accepts a step
    // from anything, and a no-op write still puts an alert on the screen.
    await tv.stepBacklight(10);

    assert.deepEqual(tv.writes, []);
    assert.equal(tv.backlight, 100);
  });
});

describe('remote keys', () => {
  it('writes the frame the set expects, in the form it expects it', async () => {
    const tv = new TestTv();
    await tv.sendKey('menu');
    await tv.sendKey('up');

    // Newline-delimited text rather than JSON, LG's own button names, and the trailing
    // blank line the set requires. The app-facing names stay lowercase.
    assert.deepEqual(
      tv.frames.map((f) => f.frame),
      ['type:button\nname:MENU\n\n', 'type:button\nname:UP\n\n'],
    );
  });

  it('sends every key when they are pressed at once', async () => {
    const tv = new TestTv();

    /*
     * Deliberately unpaced. The receiver drops commands sent back-to-back and this was
     * paced on the assumption the TV would too — it does not: five frames inside 1ms
     * all landed on the real set, counted a tile at a time on its home screen. What
     * still has to hold is that no press is lost on the way to the socket.
     */
    await Promise.all([tv.sendKey('up'), tv.sendKey('down'), tv.sendKey('left')]);

    assert.equal(tv.frames.length, 3);
  });
});
