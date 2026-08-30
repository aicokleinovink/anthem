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
    await page.getByRole('tab', { name: 'Inputs' }).click();

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

    await page.getByRole('tab', { name: 'Settings' }).click();
    // The card names the input the setting applies to.
    await expect(page.getByText('HDMI 1')).toBeVisible();

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
