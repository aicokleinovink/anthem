import { expect, open, test } from './fixtures.js';

const TRACK = {
  state: 'playing',
  title: 'Teardrop',
  artist: 'Massive Attack',
  album: 'Mezzanine',
  image: null,
  service: 'Spotify',
  elapsed: 42,
  duration: 330,
};

test.describe('mini player', () => {
  test('renders a track the streamer reports, and its transport works', async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(null);
    // The player is held for a few seconds when the streamer goes quiet, so that a skip
    // does not blink it out and back; it goes away once that hold expires.
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeHidden({
      timeout: 10_000,
    });

    await control.player(TRACK);

    const player = page.getByRole('region', { name: 'Now playing' });
    await expect(player).toBeVisible();
    await expect(player.getByText('Teardrop')).toBeVisible();
    await expect(player.getByText('Massive Attack')).toBeVisible();
    // Elapsed and total, counted locally from what the streamer reported.
    await expect(player.getByText('5:30')).toBeVisible();

    // Transport is not optimistic: the streamer's own status is the truth, so the
    // button flips when the streamer reports it, not when the press happens.
    await player.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(() => control.playerActions()).toEqual(['pause']);

    await control.player({ ...TRACK, state: 'paused' });
    await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('stays below the card in every section', async ({ page, control }) => {
    await open(page);
    await control.player(TRACK);
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();

    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();

    await page.getByRole('button', { name: 'TV', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();
  });
});
