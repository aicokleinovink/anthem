import { expect, open, test } from './fixtures.js';

/**
 * The stream's reconnection is ours rather than EventSource's, because the browser
 * abandons a stream permanently on a non-200 — what a proxy returns while the service
 * behind it restarts. That is invisible until it is needed, so it is tested here by
 * actually taking the service away.
 */
test.describe('losing the API', () => {
  // Whatever the test did, the app has to be back for everything after it.
  test.afterEach(async ({ control }) => {
    await control.startApp();
  });

  test('goes offline, disables the controls, and recovers without a reload', async ({
    page,
    control,
  }) => {
    await open(page);
    await expect(page.getByText('Offline')).toBeHidden();

    await control.stopApp();

    // Every control disables — including the power button, which used to stay live on
    // its last known state.
    await expect(page.getByText('Offline')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Volume up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Turn receiver/ })).toBeDisabled();

    // The tabs stay live on purpose: they are navigation, not receiver controls, and
    // locking them would trap you on whichever card happened to be open.
    await expect(page.getByRole('tab', { name: 'Inputs' })).toBeEnabled();

    await control.startApp();

    await expect(page.getByText('Offline')).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Volume up' })).toBeEnabled();

    // Not just visually back: the stream is carrying changes again.
    await control.push('Z1PVOL25', 'Z1VOL-65.0');
    await expect(page.getByText('-65 dB')).toBeVisible();
  });
});
