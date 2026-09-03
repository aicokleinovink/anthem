import { expect, open, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * The TV's remote keys. Unlike everything else in the app these are presses rather than
 * settings: nothing is written optimistically, nothing comes back on the stream, and the
 * only thing the card can know is whether the set is reachable at all.
 */
const remote = async (page: Page) => {
  await page.getByRole('button', { name: 'TV', exact: true }).click();
  await page.getByRole('tab', { name: 'Remote' }).click();
  // The pad is the card: no panel headings to wait on, so wait on its centre.
  await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeVisible();
};

test.describe('the TV remote', () => {
  test('sends each key to the TV, and nothing to the receiver', async ({ page, control }) => {
    await open(page);
    await remote(page);

    /*
     * The four directions are wedges of one disc, so each one's *bounding box* is the
     * whole disc and its centre sits under the OK cap — a plain `.click()` aims at that
     * centre and the cap swallows it. Aim at the glyph instead, which is drawn inside
     * the wedge it belongs to. (A thumb has no such problem: it lands where it lands,
     * and the clip-path decides which quarter that is.)
     */
    const direction = (name: string) =>
      page.getByRole('button', { name, exact: true }).locator('svg');

    await page.getByRole('button', { name: 'Settings menu', exact: true }).click();
    await direction('Up').click();
    await direction('Left').click();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await direction('Right').click();
    await direction('Down').click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    // In order, and named as the app names them — the wire spelling (`UP`, `MENU`) stays
    // inside the API's `tv/keys.ts` and nothing in the UI knows it.
    await expect
      .poll(() => control.tvKeys())
      .toEqual(['menu', 'up', 'left', 'enter', 'right', 'down', 'back']);

    // These are the TV's keys, not the receiver's. Queries are excluded: the app reads
    // the receiver on connect, and no press here caused that.
    const commanded = (await control.wire()).filter((command) => !command.endsWith('?;'));
    expect(commanded).toEqual([]);
  });

  test('locks every key when the set is unreachable', async ({ page, control }) => {
    await open(page);
    await control.tv(false, null);
    await remote(page);

    await expect(page.getByText('Off')).toBeVisible();
    for (const name of ['Settings menu', 'Up', 'OK', 'Back']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }

    await control.tv(true, 'netflix');
    await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeEnabled();
  });

  test('is offered under the TV and never under the receiver', async ({ page }) => {
    await open(page);

    await page.getByRole('button', { name: 'TV', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Remote' })).toBeVisible();

    // The receiver has no d-pad, so the section must not follow the device switch the
    // way Inputs deliberately does.
    await page.getByRole('button', { name: 'Anthem' }).click();
    await expect(page.getByRole('tab', { name: 'Remote' })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(4);
  });
});
