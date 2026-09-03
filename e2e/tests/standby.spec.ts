import { expect, open, test } from './fixtures.js';

/**
 * Standby is the app's *other* lock, and it is not the same thing as offline: the stream
 * is healthy and the app knows exactly what the receiver is doing — it is just that a
 * receiver in standby will not act on a level, a trim or an input.
 *
 * `resilience.spec.ts` covers the offline lock. This covers standby, which reaches the
 * same controls by a different route (`powerOn === false` rather than a dead stream) and
 * so can regress on its own.
 */
test.describe('standby', () => {
  // The fakes persist between tests, and everything after this one expects a live
  // receiver. Push rather than press, so no restore command has to reach the wire.
  test.afterEach(async ({ control }) => {
    await control.push('Z1POW1');
  });

  test('locks the receiver cards, and says standby rather than offline', async ({
    page,
    control,
  }) => {
    await open(page);

    // Someone puts it in standby from the front panel: it arrives as a push.
    await control.push('Z1POW0');

    await expect(page.getByText('Standby')).toBeVisible();
    // The distinction is the whole point of the label — nothing here is unreachable.
    await expect(page.getByText('Offline')).toBeHidden();

    await expect(page.getByRole('button', { name: 'Volume up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Volume down' })).toBeDisabled();

    await page.getByRole('tab', { name: 'Sound' }).click();
    for (const trim of ['Bass', 'Treble', 'Subwoofer']) {
      await expect(page.getByRole('slider', { name: trim })).toBeDisabled();
    }

    await page.getByRole('tab', { name: 'Inputs' }).click();
    await expect(page.getByText('Standby')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Streamer' })).toBeDisabled();

    // Navigation stays live for the same reason it does when offline: locking the tabs
    // would trap you on whichever card was open.
    await expect(page.getByRole('tab', { name: 'Volume' })).toBeEnabled();
    // And the power button is the one control that must not lock — it is the way out.
    await expect(page.getByRole('button', { name: 'Turn receiver on' })).toBeEnabled();

    await control.push('Z1POW1');
    await expect(page.getByText('Standby')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Streamer' })).toBeEnabled();
  });
});
