import { expect, open, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/** The reading printed above a slider, e.g. "+4.5 dB" — found from the slider itself. */
const reading = (page: Page, name: string) =>
  page.getByRole('slider', { name }).locator('xpath=..').getByText(/dB$/);

/**
 * Put all three trims back to flat before touching them.
 *
 * The fakes persist between tests, so without this a run that has already set bass to
 * +4.5 makes the next `fill('4.5')` a no-op — nothing goes on the wire and the test
 * passes without testing anything. `--repeat-each=3` is what catches it.
 */
async function flat(page: Page, control: { push: (...frames: string[]) => Promise<void> }) {
  await control.push('Z1TON00.0', 'Z1TON10.0', 'Z1LEV10.0');
  await expect(reading(page, 'Bass')).toHaveText('0.0 dB');
}

test.describe('sound', () => {
  test('writes a trim on the wire, in the form the receiver uses', async ({ page, control }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Sound' }).click();
    await flat(page, control);

    await page.getByRole('slider', { name: 'Bass' }).fill('4.5');
    // One decimal, always: the receiver answers `Z1TON05.0` even when asked with `5`.
    await expect.poll(() => control.wire()).toContain('Z1TON04.5;');
    await expect(reading(page, 'Bass')).toHaveText('+4.5 dB');
    await expect
      .poll(async () => (await control.receiverState()).tone)
      .toMatchObject({ '1': { TON0: 4.5 } });

    // A negative reads with a true minus, and the subwoofer is Z1LEV1, not a TON key.
    await page.getByRole('slider', { name: 'Subwoofer' }).fill('-2.5');
    await expect.poll(() => control.wire()).toContain('Z1LEV1-2.5;');
    await expect(reading(page, 'Subwoofer')).toHaveText('−2.5 dB');
    await expect
      .poll(async () => (await control.receiverState()).tone)
      .toMatchObject({ '1': { LEV1: -2.5 } });
  });

  test('a dragged slider does not flood the receiver', async ({ page, control }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Sound' }).click();
    await flat(page, control);

    const treble = page.getByRole('slider', { name: 'Treble' });
    for (const db of ['1', '2', '3', '4', '5']) await treble.fill(db);

    // Only the value it was let go at has to land; the ones it overtook are dropped
    // rather than queued, because the receiver loses commands sent back-to-back.
    await expect
      .poll(async () => (await control.receiverState()).tone)
      .toMatchObject({ '1': { TON1: 5 } });
    const writes = (await control.wire()).filter((frame) => frame.startsWith('Z1TON1'));
    expect(writes.length).toBeLessThan(5);
  });

  test('follows a change pushed by the receiver', async ({ page, control }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Sound' }).click();
    await flat(page, control);

    // Somebody turned the bass down on the front panel.
    await control.push('Z1TON0-6.0');
    await expect(reading(page, 'Bass')).toHaveText('−6.0 dB');
    await expect(page.getByRole('slider', { name: 'Bass' })).toHaveValue('-6');
  });
});
