import { expect, open, test } from './fixtures.js';

/**
 * The toolbar is split into two device groups. What matters here is not the layout but
 * that a press under one group reaches that device and not the other.
 */
test.describe('device groups', () => {
  test('the TV group offers its two sections, and dispatches to the TV', async ({
    page,
    control,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'TV', exact: true }).click();

    // Two sections under the TV: the set's own sources, and its remote keys.
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'Inputs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Remote' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Watch' })).toBeVisible();

    await page.getByRole('button', { name: 'YouTube' }).click();
    await expect(page.getByRole('button', { name: 'YouTube' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await expect.poll(() => control.tvSelections()).toEqual(['youtube']);
    // Nothing was *commanded* of the receiver: these are different devices that happen
    // to share a toolbar. Queries are excluded — the app reads the receiver on connect,
    // and that is not something a press here caused.
    const commanded = (await control.wire()).filter((command) => !command.endsWith('?;'));
    expect(commanded).toEqual([]);
  });

  test('the Anthem group keeps its four sections and dispatches to the receiver', async ({
    page,
    control,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Anthem' }).click();

    await expect(page.getByRole('tab')).toHaveCount(4);
    for (const name of ['Volume', 'Sound', 'Inputs', 'Settings']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }

    // Start on a different input, so the press is always a change.
    await page.request.put('/api/input', { data: { input: 1 } });
    await page.getByRole('tab', { name: 'Inputs' }).click();
    await page.getByRole('button', { name: 'Streamer' }).click();
    await expect(page.getByRole('button', { name: 'Streamer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await expect.poll(() => control.wire()).toContain('Z1INP4;');
    expect(await control.tvSelections()).toEqual([]);
    expect((await control.receiverState()).input).toBe(4);
  });

  test('the TV card says Off when the set is unreachable', async ({ page, control }) => {
    await open(page);
    await control.tv(false, null);
    await page.getByRole('button', { name: 'TV', exact: true }).click();

    await expect(page.getByText('Off')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Netflix' })).toBeDisabled();

    await control.tv(true, 'netflix');
    await expect(page.getByRole('button', { name: 'Netflix' })).toBeEnabled();
  });
});
