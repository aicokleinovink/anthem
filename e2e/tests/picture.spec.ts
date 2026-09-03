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
  // The fakes persist between tests, and the value is theirs — put it back.
  test.afterEach(async ({ control }) => {
    await control.tv(true, 'netflix');
  });

  test('steps the brightness by ten, and shows what the set reports', async ({
    page,
    control,
  }) => {
    await open(page);
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
});
