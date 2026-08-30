import { expect, open, shownDb, test } from './fixtures.js';

test.describe('power', () => {
  test('turns the receiver off and back on, and follows a pushed change', async ({
    page,
    control,
  }) => {
    await open(page);

    const off = page.getByRole('button', { name: 'Turn receiver off' });
    await expect(off).toBeVisible();

    await off.click();
    await expect(page.getByRole('button', { name: 'Turn receiver on' })).toBeVisible();
    // The UI is optimistic, so the command lands a moment after the icon changes —
    // and the transport paces its writes on purpose. Poll rather than race it.
    await expect.poll(() => control.wire()).toContain('Z1POW0;');
    expect((await control.receiverState()).power).toMatchObject({ '1': false });

    // Standby is shown as standby, not as a network problem.
    await expect(page.getByText('Standby')).toBeVisible();

    // Someone presses the physical remote: the receiver pushes it, unasked.
    await control.push('Z1POW1');
    await expect(page.getByRole('button', { name: 'Turn receiver off' })).toBeVisible();
    await expect(page.getByText('Standby')).toBeHidden();
  });
});

test.describe('volume', () => {
  test('steps one dB per press, over VUP/VDN', async ({ page, control }) => {
    await open(page);
    const start = await shownDb(page);

    await page.getByRole('button', { name: 'Volume up' }).click();
    await expect(page.getByText(`${start + 1} dB`)).toBeVisible();

    await page.getByRole('button', { name: 'Volume down' }).click();
    await expect(page.getByText(`${start} dB`)).toBeVisible();

    // They take no argument; anything else is rejected by the receiver.
    await expect
      .poll(() => control.wire().then((wire) => wire.filter((c) => /^Z1V(UP|DN)/.test(c))))
      .toEqual(['Z1VUP;', 'Z1VDN;']);
  });

  test('coalesces fast presses into a single request', async ({ page, control }) => {
    await open(page);
    const start = await shownDb(page);

    // The presses that actually left the browser, and how many steps each carried.
    const sent: number[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/api/volume/step')) return;
      sent.push((JSON.parse(request.postData() ?? '{}') as { steps: number }).steps);
    });

    const up = page.getByRole('button', { name: 'Volume up' });
    for (let press = 0; press < 5; press += 1) await up.click();

    // Every press counts, and the number moves immediately on each one.
    await expect(page.getByText(`${start + 5} dB`)).toBeVisible();
    await expect
      .poll(() => control.wire().then((wire) => wire.filter((c) => c === 'Z1VUP;').length))
      .toBe(5);

    // The point of the coalescing: five presses do not become five requests. How many
    // they *do* become depends on how fast the round trip is, so only the shape is
    // pinned — the receiver silently drops commands that arrive too fast, which is why
    // flooding it is not an option.
    expect(sent.reduce((total, steps) => total + steps, 0)).toBe(5);
    expect(sent.length).toBeLessThan(5);
  });

  test('shows mute without offering to control it', async ({ page, control }) => {
    await open(page);

    // Mute comes from the physical remote; the card reports it so the level on screen
    // is never misleading, and that is all it does.
    await control.push('Z1MUT1');
    await expect(page.getByText('· muted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volume up' })).toBeEnabled();

    await control.push('Z1MUT0');
    await expect(page.getByText('· muted')).toBeHidden();
  });

  test('an absolute set is written with PVOL, never VOL', async ({ page, control }) => {
    await open(page);

    const response = await page.request.put('/api/volume', { data: { db: -60 } });
    expect(response.ok()).toBe(true);

    // Arrives back on the stream, so the dial moves without anything asking it to.
    await expect(page.getByText('-60 dB')).toBeVisible();
    await expect(page.getByText('30%')).toBeVisible();

    const wire = await control.wire();
    // percent === dB + 90 on this unit, so -60 dB is 30%.
    expect(wire).toContain('Z1PVOL30;');
    // Z1VOL is a query only. As a setter the receiver does not land on the value given.
    expect(wire.some((command) => /^Z1VOL(?!\?)/.test(command))).toBe(false);
    expect((await control.receiverState()).volumeDb).toMatchObject({ '1': -60 });
  });

  test('a change pushed by the receiver updates the dial without a reload', async ({
    page,
    control,
  }) => {
    await open(page);

    // Exactly what the unit sends when someone turns the knob: PVOL, then VOL.
    await control.push('Z1PVOL25', 'Z1VOL-65.0');

    await expect(page.getByText('-65 dB')).toBeVisible();
    await expect(page.getByText('25%')).toBeVisible();
  });
});

test.describe('inputs', () => {
  test('selects an input and shows it as selected', async ({ page, control }) => {
    await open(page);
    // Start somewhere else, so the press below is always a change: selecting the input
    // that is already selected is a no-op, and the test would pass without doing anything.
    await page.request.put('/api/input', { data: { input: 1 } });
    await page.getByRole('tab', { name: 'Inputs' }).click();
    await expect(page.getByRole('button', { name: 'HDMI 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const airplay = page.getByRole('button', { name: 'Airplay' });
    await airplay.click();

    await expect(airplay).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => control.wire()).toContain('Z1INP2;');
    expect((await control.receiverState()).input).toBe(2);
  });
});

test.describe('speaker profiles', () => {
  test('writes the 0-based value for a 1-based profile', async ({ page, control }) => {
    await open(page);

    // Pin the input first: the profile is a per-input setting, so the command names it.
    await page.getByRole('tab', { name: 'Inputs' }).click();
    await page.getByRole('button', { name: 'HDMI 1' }).click();
    await expect(page.getByRole('button', { name: 'HDMI 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // And from a known profile, for the same reason.
    await page.request.put('/api/speaker-profile', { data: { profile: 0, input: 1 } });

    await page.getByRole('tab', { name: 'Settings' }).click();
    // The card names the input the setting applies to.
    await expect(page.getByText('HDMI 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Center' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // "Corner" is profile 2, and profile 2 goes on the wire as 1.
    await page.getByRole('button', { name: 'Corner' }).click();
    await expect(page.getByRole('button', { name: 'Corner' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await expect.poll(() => control.wire()).toContain('IS1SP1;');
    expect((await control.receiverState()).inputProfiles).toMatchObject({ '1': 1 });
  });
});
