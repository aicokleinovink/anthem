/**
 * What the TV card offers. Ids came from asking the TV itself:
 * `ssap://tv/getExternalInputList` and `listLaunchPoints`.
 *
 * Edit this list to change the pills. `input` switches an HDMI socket, `app` launches
 * an application.
 */
export interface TvTarget {
  key: string;
  label: string;
  kind: 'input' | 'app';
  /** HDMI_1 … for inputs; the launch-point id for apps. */
  id: string;
  /**
   * What the TV reports as the foreground app when this target is active, so the card
   * can show which one is selected. Inputs run as their own app on webOS.
   */
  foregroundId: string;
}

export const TV_TARGETS: TvTarget[] = [
  { key: 'hdmi1', label: 'HDMI 1', kind: 'input', id: 'HDMI_1', foregroundId: 'com.webos.app.hdmi1' },
  {
    key: 'playstation',
    label: 'PlayStation',
    kind: 'input',
    id: 'HDMI_3',
    foregroundId: 'com.webos.app.hdmi3',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    kind: 'app',
    id: 'youtube.leanback.v4',
    foregroundId: 'youtube.leanback.v4',
  },
  { key: 'netflix', label: 'Netflix', kind: 'app', id: 'netflix', foregroundId: 'netflix' },
];
