import { expect, open, test } from './fixtures.js';

test.describe('settings', () => {
  test('writes the front panel display setting', async ({ page, control }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Settings' }).click();

    await page.getByRole('button', { name: 'Volume Only' }).click();
    await expect(page.getByRole('button', { name: 'Volume Only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => control.wire()).toContain('GCFPDI1;');

    await page.getByRole('button', { name: 'All' }).click();
    await expect.poll(() => control.wire()).toContain('GCFPDI0;');
  });

  test('hides the profile slots nobody has renamed', async ({ page, control }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Settings' }).click();

    // The receiver always reports four slots; two are still called Profile3/Profile4.
    await expect(page.getByRole('button', { name: 'Center' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Corner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Profile3' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Profile4' })).toBeHidden();

    // With none of them renamed there is nothing to show, so it shows all four rather
    // than an empty picker.
    await control.push('SSSP10Profile1', 'SSSP20Profile2');
    for (const slot of ['Profile1', 'Profile2', 'Profile3', 'Profile4']) {
      await expect(page.getByRole('button', { name: slot })).toBeVisible();
    }

    // Naming one makes it appear on its own — and puts the fake back as it was.
    await control.push('SSSP10Center');
    await expect(page.getByRole('button', { name: 'Center' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Profile3' })).toBeHidden();
    await control.push('SSSP20Corner');
    await expect(page.getByRole('button', { name: 'Corner' })).toBeVisible();
  });
});
