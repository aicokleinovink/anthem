/**
 * The remote keys the app can send, and the button names the TV knows them by.
 *
 * These do not travel on the SSAP socket at all — they go to a second socket the set
 * hands out (see `WebosTv.sendKey`), as newline-delimited text rather than JSON.
 *
 * The app-facing names are lowercase and stable; the wire names are LG's. Nothing else
 * in the app should know the wire spelling, the same way nothing outside the receiver's
 * protocol module knows `Z1PVOL`.
 */
export const TV_KEYS = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  enter: 'ENTER',
  back: 'BACK',
  /*
   * Opens the set's own settings menu, and `back` closes it. Worth knowing before
   * building any UI on top: the menu is an *overlay*, not an app, so the TV keeps
   * reporting whatever app is behind it as the foreground. Nothing can tell whether
   * the menu is open, so nothing may claim to.
   */
  menu: 'MENU',
} as const;

export type TvKey = keyof typeof TV_KEYS;

/** A non-empty tuple, which is the shape `z.enum` wants. */
export const TV_KEY_NAMES = Object.keys(TV_KEYS) as [TvKey, ...TvKey[]];

