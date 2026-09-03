import { expect, open, test } from './fixtures.js';
import type { Page } from '@playwright/test';

/**
 * Layout at phone width.
 *
 * Every other spec runs at Playwright's desktop default, which is how #57 — a title
 * truncating at 375pt — sat as an unverified hunch for a week: nothing in the suite ever
 * rendered the app at the width it is actually used at. These tests are about geometry
 * rather than behaviour, so they assert relationships (this column gets the remainder)
 * instead of pixel counts wherever a pixel count would just be a screenshot in numbers.
 */
test.use({ viewport: { width: 375, height: 812 } });

const TRACK = {
  state: 'playing',
  title: 'Teardrop',
  artist: 'Massive Attack',
  album: 'Mezzanine',
  image: null,
  service: 'Spotify',
  elapsed: 42,
  duration: 330,
  canSeek: true,
};

/** A title comfortably longer than the strip can ever show. */
const LONG = { ...TRACK, title: 'Group Four (Deluxe Remaster Edition, Take 3)' };

const player = (page: Page) => page.getByRole('region', { name: 'Now playing' });

/** The strip's own measurements, read from the DOM rather than from a screenshot. */
async function strip(page: Page) {
  return player(page).evaluate((el) => {
    const title = el.querySelector('span') as HTMLElement;
    const text = title.parentElement as HTMLElement;
    const mini = text.parentElement as HTMLElement;
    const controls = mini.querySelector('button[aria-label="Next track"]')!
      .parentElement as HTMLElement;
    const box = (node: HTMLElement) => Math.round(node.getBoundingClientRect().width);
    const pad = getComputedStyle(mini);
    return {
      width: box(el as HTMLElement),
      height: Math.round(el.getBoundingClientRect().height),
      text: box(text),
      controls: box(controls),
      // Everything the text column does not get: artwork, transport, gap and padding.
      spent:
        parseFloat(pad.paddingLeft) +
        parseFloat(pad.paddingRight) +
        parseFloat(pad.columnGap) +
        box(controls),
      titleShown: title.clientWidth,
      titleNeeded: title.scrollWidth,
    };
  });
}

test.describe('the collapsed player at 375pt', () => {
  test('gives the title every pixel the fixed furniture does not take', async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(LONG);
    await expect(player(page)).toBeVisible();

    const strip375 = await strip(page);

    // The title column is `1fr` against an `auto` transport, so it must end up with
    // exactly the remainder. This is the claim #57 was about, kept honest here.
    expect(strip375.text).toBe(strip375.width - strip375.spent);

    // A title too long to fit is allowed to truncate — but only after taking the lot.
    expect(strip375.titleNeeded).toBeGreaterThan(strip375.titleShown);
    expect(strip375.titleShown).toBe(strip375.text);
  });

  test('does not change height or move the transport for a longer title', async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);
    await expect(player(page).getByText('Teardrop')).toBeVisible();
    const short = await strip(page);

    await control.player(LONG);
    await expect(player(page).getByText(LONG.title)).toBeVisible();
    const long = await strip(page);

    // The strip sits below a fixed-height card, so its height is not the title's to
    // spend — and the transport cluster holds its width whatever the title does.
    expect(long.height).toBe(short.height);
    expect(long.controls).toBe(short.controls);
    expect(long.text).toBe(short.text);
  });

  test('the expanded player still fits the card slot exactly', async ({ page, control }) => {
    await open(page);
    await control.player(LONG);
    await player(page).getByRole('button', { name: 'Expand player' }).click();

    // Narrow enough that the artwork is limited by the width rather than by its cap,
    // which is the branch `ART.large` exists for and only shows up at this size.
    await expect
      .poll(async () => Math.round((await player(page).boundingBox())!.height))
      .toBe(Math.round((await page.getByRole('tabpanel').boundingBox())!.height));

    const art = await player(page).evaluate((el) => {
      const image = el.querySelector('div[aria-hidden="true"]') as HTMLElement;
      return Math.round(image.getBoundingClientRect().width);
    });
    // 375 − 2×48 margin = 279, under the 164 cap, so the cap is what wins even here.
    expect(art).toBe(164);

    // And nothing overflows the surface it is drawn in.
    const overflow = await player(page).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBe(0);
  });
});

/** The chrome above the card has to survive the narrow width too. */
test.describe('the shell at 375pt', () => {
  test('keeps the toolbar on one row, and nothing overflows sideways', async ({ page }) => {
    await open(page);

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);

    // One row: every tab shares a top edge. A wrapped toolbar is the failure this
    // catches, and it is invisible at desktop width.
    const tops = await tabs.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);

    // Cards enter with a sideways slide, so the document is legitimately wider than the
    // viewport while that is running. Wait for it to finish rather than measuring the
    // animation — this is the one place the suite has to care about it.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== 'running'),
    );

    // The page itself must not scroll sideways at the width it is used at.
    const horizontal = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontal).toBe(0);
  });

  /*
   * The same assertion under a font wider than the system stack.
   *
   * This is not hypothetical: CI's Linux fallback renders the tabs ~30px wider than SF
   * Pro, and the shell used to grow with them and push the page sideways — green on a
   * Mac, red on CI. The cause was `.screen`'s implicit `auto` grid column, which is
   * sized by its content, so the shell's own `width: min(390px, 100%)` never bound.
   *
   * Verdana stands in for "wider than we designed for". What must hold is that the tabs
   * give way — shrinking and scrolling inside their own bar — rather than the page.
   */
  test('does not widen the page when the font renders wider', async ({ page }) => {
    await open(page);
    await page.addStyleTag({ content: '*{font-family:Verdana,sans-serif !important}' });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== 'running'),
    );

    const { horizontal, tabsFit } = await page.evaluate(() => {
      const tabs = document.querySelector('[role="tablist"]') as HTMLElement;
      return {
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // The row is allowed to be wider than its own box; that is what scrolls.
        tabsFit: tabs.getBoundingClientRect().right <= window.innerWidth,
      };
    });

    expect(horizontal).toBe(0);
    expect(tabsFit).toBe(true);
  });
});
