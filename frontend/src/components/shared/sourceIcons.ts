import airplay from '../../assets/sources/airplay.svg';
import appletv from '../../assets/sources/appletv.svg';
import disc from '../../assets/sources/disc.svg';
import gamepad from '../../assets/sources/gamepad.svg';
import generic from '../../assets/sources/generic.svg';
import hdmi from '../../assets/sources/hdmi.svg';
import music from '../../assets/sources/music.svg';
import netflix from '../../assets/sources/netflix.svg';
import playstation from '../../assets/sources/playstation.svg';
import tv from '../../assets/sources/tv.svg';
import youtube from '../../assets/sources/youtube.svg';

/**
 * Source → icon, in one place for both pickers, so the TV's targets and the receiver's
 * inputs draw from the same set and the two cards read as one system.
 *
 * The files are single-shape SVGs and are used as masks, not as images: the tile fills
 * them with the label colour, so an icon dims with its tile and a brand mark does not
 * arrive as the one saturated thing on an otherwise monochrome surface.
 */

/** The TV's own targets, keyed exactly as `api/src/tv/targets.ts` names them. */
const TV_ICONS: Record<string, string> = {
  hdmi1: hdmi,
  playstation,
  youtube,
  netflix,
  appletv,
};

/**
 * The receiver names its own inputs, and the names are whatever the installer typed —
 * so this matches on what a name contains rather than on a fixed list. First match wins,
 * which is why the specific devices come before the bare socket.
 */
const INPUT_ICONS: Array<[RegExp, string]> = [
  [/playstation|\bps[45]?\b/i, playstation],
  [/xbox|game|switch/i, gamepad],
  [/netflix/i, netflix],
  [/youtube/i, youtube],
  [/apple\s*tv/i, appletv],
  [/airplay|air\s*play/i, airplay],
  [/blu.?ray|dvd|disc|\bcd\b/i, disc],
  [/stream|node|blu\s*os|sonos|spotify|music|tuner|radio/i, music],
  [/\btv\b|cable|kpn|sat/i, tv],
  [/hdmi|arc|\bin\s*\d/i, hdmi],
];

export function iconForTvTarget(key: string): string {
  return TV_ICONS[key] ?? generic;
}

export function iconForInputName(name: string): string {
  return INPUT_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? generic;
}
