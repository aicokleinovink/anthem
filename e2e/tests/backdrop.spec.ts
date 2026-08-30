import { expect, open, test } from './fixtures.js';

const COVER =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNmMDgiLz48L3N2Zz4=';

const TRACK = {
  state: 'playing',
  title: 'Satellite Signal',
  artist: 'MIND',
  album: 'Halcyon',
  image: COVER,
  service: 'Spotify',
  elapsed: 42,
  duration: 330,
  canSeek: true,
};

/*
 * The backdrop is decorative and carries no role or label of its own — correctly, since
 * nothing should announce it — so this is the one place a test reaches for structure
 * rather than a role. It is still not a class name: the hashed name would change on any
 * CSS Modules rename.
 */
const layers = 'main > div[aria-hidden="true"] img';

test.describe('artwork backdrop', () => {
  test('takes its colour from the cover, and lets go when the music stops', async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);

    await expect(page.locator(layers)).toHaveAttribute('src', COVER);

    // The white surfaces stop relying on a dark ground behind them.
    const shell = page.locator('main > div').nth(1);
    await expect(shell).toHaveClass(/tinted/);

    await control.player(null);
    // Held for a few seconds first, so a skip does not drop the colour out and back.
    await expect(shell).not.toHaveClass(/tinted/, { timeout: 10_000 });
  });

  test('a track with no cover leaves the plain canvas', async ({ page, control }) => {
    await open(page);
    await control.player({ ...TRACK, image: null });

    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();
    await expect(page.locator(layers)).toHaveCount(0);
  });
});
