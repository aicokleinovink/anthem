import { expect, open, test } from "./fixtures.js";

const TRACK = {
  state: "playing",
  title: "Teardrop",
  artist: "Massive Attack",
  album: "Mezzanine",
  image: null,
  service: "Spotify",
  elapsed: 42,
  duration: 330,
  canSeek: true,
};

/** Live radio: no length, and the streamer will not accept a seek. */
const RADIO = {
  ...TRACK,
  title: "NPO Radio 2",
  album: null,
  duration: null,
  canSeek: false,
};

const player = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Now playing" });

test.describe("player", () => {
  test("renders a track the streamer reports, and its transport works", async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(null);
    // The player is held for a few seconds when the streamer goes quiet, so that a skip
    // does not blink it out and back; it goes away once that hold expires.
    await expect(page.getByRole("region", { name: "Now playing" })).toBeHidden({
      timeout: 10_000,
    });

    await control.player(TRACK);

    const player = page.getByRole("region", { name: "Now playing" });
    await expect(player).toBeVisible();
    await expect(player.getByText("Teardrop")).toBeVisible();
    await expect(player.getByText("Massive Attack")).toBeVisible();
    // Elapsed and total, counted locally from what the streamer reported.
    await expect(player.getByText("5:30")).toBeVisible();

    // Transport is not optimistic: the streamer's own status is the truth, so the
    // button flips when the streamer reports it, not when the press happens.
    // Exact: "Expand player" would otherwise also match a search for "Play".
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(() => control.playerActions()).toEqual(["pause"]);

    await control.player({ ...TRACK, state: "paused" });
    await expect(
      player.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
  });

  test("stays below the card in every section", async ({ page, control }) => {
    await open(page);
    await control.player(TRACK);
    await expect(
      page.getByRole("region", { name: "Now playing" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(
      page.getByRole("region", { name: "Now playing" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "TV", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Now playing" }),
    ).toBeVisible();
  });
});

test.describe("expanding", () => {
  test("grows into the card slot and back, from the button", async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);

    const strip = await player(page).boundingBox();
    await player(page).getByRole("button", { name: "Expand player" }).click();

    // It ends up exactly where the card was: same size, same place.
    const card = page.getByRole("tabpanel");
    await expect
      .poll(async () => {
        const now = await player(page).boundingBox();
        return Math.round(now!.height);
      })
      .toBe(Math.round((await card.boundingBox())!.height));

    // The strip's controls are gone from the page while it is open, not merely hidden.
    await expect(
      player(page).getByRole("button", { name: "Expand player" }),
    ).toHaveCount(0);

    await player(page).getByRole("button", { name: "Collapse player" }).click();
    await expect
      .poll(async () => Math.round((await player(page).boundingBox())!.height))
      .toBe(Math.round(strip!.height));
  });

  test("a section tab both closes it and navigates", async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);
    await player(page).getByRole("button", { name: "Expand player" }).click();
    await expect(
      player(page).getByRole("button", { name: "Collapse player" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      player(page).getByRole("button", { name: "Expand player" }),
    ).toBeVisible();
  });

  test("seeks the streamer, and will not offer to for live radio", async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);
    await player(page).getByRole("button", { name: "Expand player" }).click();

    const seek = player(page).getByRole("slider", { name: "Seek" });
    await seek.fill("200");
    // Committed on release rather than on every value, so a drag is one request.
    await seek.dispatchEvent("pointerup");
    await expect.poll(() => control.playerActions()).toContain("seek:200");

    await control.player(RADIO);
    await expect(seek).toBeDisabled();
  });

  test("a dragged volume slider does not flood the receiver", async ({
    page,
    control,
  }) => {
    await open(page);
    await control.player(TRACK);
    await player(page).getByRole("button", { name: "Expand player" }).click();

    const volume = player(page).getByRole("slider", { name: "Volume" });
    for (const db of ["-70", "-65", "-60", "-55"]) await volume.fill(db);

    // The last value is what the receiver must end up on; the ones it overtook are
    // dropped rather than queued, because the receiver silently loses commands sent
    // back-to-back.
    await expect
      .poll(async () => (await control.receiverState()).volumeDb)
      .toMatchObject({ "1": -55 });
    const writes = (await control.wire()).filter((frame) =>
      frame.startsWith("Z1PVOL"),
    );
    expect(writes.length).toBeLessThan(4);
  });
});
