import { expect, open, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * OLED pixel brightness. The set is the authority: a press sends a step, and the API
 * reads the current value before writing, so a change made with the TV's own remote is
 * never overwritten by a stale number from the app.
 *
 * On the real thing the write cannot be done directly at all — `setSystemSettings` is
 * refused for third-party apps and the value goes through an alert carrying a `luna://`
 * action. That is the API's problem, not this test's: what matters here is that a press
 * lands on the set as the right number.
 */
const picture = async (page: Page) => {
  await page.getByRole('button', { name: 'TV', exact: true }).click();
  await page.getByRole('tab', { name: 'Picture' }).click();
  // A control rather than the status line: the status says "Off" when the set is
  // unreachable, which is one of the cases below.
  await expect(page.getByRole('button', { name: 'Dimmer' })).toBeVisible();
};

test.describe('picture', () => {
  // The fakes persist between tests, and the value is theirs — put it back. The
  // refuse-writes flag is cleared by the log reset the fixture runs before every test,
  // so a failure here cannot leave the set refusing for everything after it.
  test.afterEach(async ({ control }) => {
    await control.tv(true, 'netflix');
  });

  test('steps the brightness by ten, and shows what the set reports', async ({
    page,
    control,
  }) => {
    await open(page);
    await control.tvReportsBacklight(100);
    await picture(page);
    await expect(page.getByText('OLED pixel brightness')).toBeVisible();

    // Whatever it was, the dial reads the set's own number rather than a percentage of
    // some other scale: 0-100 is what the TV uses.
    await expect(page.getByText('100', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Dimmer' }).click();
    await expect.poll(() => control.tvBacklights()).toEqual([90]);
    await expect(page.getByText('90', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Brighter' }).click();
    await expect.poll(() => control.tvBacklights()).toEqual([90, 100]);
    await expect(page.getByText('100', { exact: true })).toBeVisible();

    // The brighter button stops at the top of the set's own scale rather than asking
    // for 110 and letting the TV decide what that means.
    await expect(page.getByRole('button', { name: 'Brighter' })).toBeDisabled();

    // This is the TV's setting, not the receiver's: nothing went on the wire.
    const commanded = (await control.wire()).filter((command) => !command.endsWith('?;'));
    expect(commanded).toEqual([]);
  });

  test('says so when the set reports no value at all', async ({ page, control }) => {
    await open(page);
    // An unreachable set reports nothing, which is also what an old client key gets:
    // the card must not invent a number for the dial.
    await control.tv(false, null);
    await picture(page);

    await expect(page.getByText('––')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Brighter' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Dimmer' })).toBeDisabled();
  });

  /*
   * Pressing faster than the wire can carry it.
   *
   * This is the bug this test exists for: the card used the shared optimistic write,
   * which drops a second write while one is in flight, so presses two, three and four
   * moved the number on screen and never left the browser — and the next snapshot
   * yanked the display back to where the set actually was. Brightness now has its own
   * queue, and the steps that pile up go out together.
   */
  test('loses no presses when they come faster than the wire', async ({ page, control }) => {
    await open(page);
    await control.tvReportsBacklight(100);
    await picture(page);
    await expect(page.getByText('100', { exact: true })).toBeVisible();

    const dimmer = page.getByRole('button', { name: 'Dimmer' });
    // No awaits between them: four presses inside the time one request takes.
    await Promise.all([dimmer.click(), dimmer.click(), dimmer.click(), dimmer.click()]);

    // Forty points of dimming, however many requests it took to carry them. The card
    // and the set must agree at the end — the old bug ended at 90 with the card
    // showing 60 for a moment first.
    await expect(page.getByText('60', { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const written = await control.tvBacklights();
        return written.at(-1);
      })
      .toBe(60);

    /*
     * Back up again — and wait for the *set* to be there, not the card. The number on
     * screen can be the optimistic guess, so asserting on it let this test finish with
     * a write still in flight and the fake left at 70 or 90. The next test then found a
     * baseline it did not expect, which is why it failed on some runs and not others.
     */
    const brighter = page.getByRole('button', { name: 'Brighter' });
    await Promise.all([brighter.click(), brighter.click(), brighter.click(), brighter.click()]);
    await expect
      .poll(async () => (await control.tvBacklights()).at(-1))
      .toBe(100);
  });

  /*
   * A set that refuses the write is not the app being offline.
   *
   * The card used to report every failure through `reportWrite(false)`, which is the
   * app-wide offline flag — so one refused TV setting disabled the volume dial, the
   * power button and every other card. An un-repaired client key cannot write picture
   * settings at all, which makes this the *normal* state of a fresh install.
   */
  test('a refused write does not take the whole app offline', async ({ page, control }) => {
    await open(page);
    await control.tvReportsBacklight(100);
    await control.refuseTvBacklight(true);
    await picture(page);

    await page.getByRole('button', { name: 'Dimmer' }).click();

    // The card falls back to what the set reports, and nothing anywhere claims offline.
    await expect(page.getByText('100', { exact: true })).toBeVisible();
    await expect(page.getByText('Offline')).toBeHidden();

    // The receiver is reachable and its controls must stay live.
    await page.getByRole('button', { name: 'Anthem' }).click();
    await expect(page.getByRole('button', { name: 'Volume up' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Turn receiver/ })).toBeEnabled();
  });
});
