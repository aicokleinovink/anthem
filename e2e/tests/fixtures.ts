import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

const CONTROL_URL = process.env.FAKE_CONTROL_URL ?? 'http://127.0.0.1:3101';

/**
 * The fakes' own control surface, on a separate port so nothing test-only is mounted
 * on the app under test. It reports what the devices were sent and lets a test push a
 * change at them, the way the front panel or another remote would.
 */
export interface Control {
  /** Commands the fake receiver has been sent since this test started, e.g. `Z1VUP;`. */
  wire: () => Promise<string[]>;
  /** Targets the TV was asked to switch to. */
  tvSelections: () => Promise<string[]>;
  /** Transport actions the streamer was asked to perform. */
  playerActions: () => Promise<string[]>;
  /** Remote keys the TV was sent, e.g. `menu`, in order. */
  tvKeys: () => Promise<string[]>;
  /** The state the fake receiver holds — what a write actually landed on. */
  receiverState: () => Promise<Record<string, unknown>>;
  /** Broadcast frames from the receiver, without their terminators: `push('Z1POW1')`. */
  push: (...frames: string[]) => Promise<void>;
  /** Report a track, or `null` for nothing loaded. */
  player: (now: unknown) => Promise<void>;
  tv: (available: boolean, current: string | null) => Promise<void>;
  /** Take the app's HTTP listener away, and bring it back. The devices keep running. */
  stopApp: () => Promise<void>;
  startApp: () => Promise<void>;
}

function control(api: APIRequestContext): Control {
  return {
    wire: async () => (await (await api.get('/log')).json()).receiver,
    tvSelections: async () => (await (await api.get('/log')).json()).tv,
    playerActions: async () => (await (await api.get('/log')).json()).player,
    tvKeys: async () => (await (await api.get('/log')).json()).tvKeys,
    receiverState: async () => (await api.get('/receiver')).json(),
    push: async (...frames) => {
      await api.post('/push', { data: { frames } });
    },
    player: async (now) => {
      await api.post('/player', { data: { now } });
    },
    tv: async (available, current) => {
      await api.post('/tv', { data: { available, current } });
    },
    stopApp: async () => {
      await api.post('/app/stop');
    },
    startApp: async () => {
      await api.post('/app/start');
    },
  };
}

export const test = base.extend<{ control: Control }>({
  control: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ baseURL: CONTROL_URL });
    // Each test asserts on what *it* sent, so the log starts empty.
    await api.post('/log/reset');
    await use(control(api));
    await api.dispose();
  },
});

export { expect };

/**
 * Open the app and wait for the first snapshot to have rendered. Every query below is
 * by role or label rather than by class, so a CSS Modules rename cannot break a test.
 */
export async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Volume' })).toBeVisible();
  // The dial reads "connecting" until the stream delivers a level.
  await expect(page.getByText(/^-?\d+ dB/)).toBeVisible();
}

/** The receiver's level as the dial is currently reporting it, in dB. */
export async function shownDb(page: Page): Promise<number> {
  const caption = await page.getByText(/^-?\d+ dB/).innerText();
  return Number(caption.replace(/ dB.*$/, ''));
}
