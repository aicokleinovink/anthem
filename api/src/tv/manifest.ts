/**
 * The registration manifest, in one place because **the client key carries whatever
 * permissions were granted when it was paired**. `pair-tv` and the running app have to
 * present the same list, or the key comes back without the permission the app then
 * relies on and every request for it answers `401` — which looks exactly like a bug in
 * the request rather than a stale key.
 *
 * LG's own app sends a signed manifest; a plain one is enough for prompt-based pairing,
 * which is why this needs no extra dependency.
 */
export const TV_MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.1',
  signed: {
    created: '20140509',
    appId: 'com.anthem.remote',
    vendorId: 'com.anthem',
    localizedAppNames: { '': 'Anthem Remote' },
    localizedVendorNames: { '': 'Anthem Remote' },
    permissions: ['TEST_SECURE'],
    serial: '2f930e2d2cfe083771f68e4fe7bb07',
  },
  permissions: [
    'LAUNCH',
    'CONTROL_AUDIO',
    'CONTROL_POWER',
    'READ_INSTALLED_APPS',
    'READ_RUNNING_APPS',
    'CONTROL_INPUT_TV',
    'READ_INPUT_DEVICE_LIST',
    'WRITE_NOTIFICATION_TOAST',
    /*
     * The d-pad. Without this the set answers `getPointerInputSocket` with
     * `401 insufficient permissions` while every other request on the same key keeps
     * working — probed against the real MRX-adjacent LG, so it is the permission list
     * and not the protocol. Adding it means re-pairing: run `npm run pair-tv` and accept
     * the prompt again, then put the new key in .env. The old key keeps working for the
     * old permission set, so the two coexist and an un-repaired install simply has no
     * remote section rather than a broken one.
     */
    'CONTROL_MOUSE_AND_KEYBOARD',
    /*
     * Picture settings — OLED pixel brightness is the `backlight` key in the `picture`
     * category. Same story as the d-pad: without these the set answers `401` for
     * `settings/getSystemSettings`. Whether it will accept a *write* from an app that is
     * not one of its own is a separate question the permission does not settle.
     */
    'READ_SETTINGS',
    'WRITE_SETTINGS',
  ],
};
