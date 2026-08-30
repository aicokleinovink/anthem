/**
 * The BluOS streamer (a Bluesound Node) that feeds the receiver.
 *
 * The receiver itself has no idea what is playing — audio just arrives on an input — so
 * now-playing information comes from the streamer's own local HTTP API on port 11000.
 * No authentication, no cloud, and it reports whatever the Node plays: Spotify, Tidal,
 * radio, Airplay, local files.
 */

export type PlayerState = 'playing' | 'paused' | 'loading' | 'stopped';

export interface NowPlaying {
  state: PlayerState;
  title: string | null;
  artist: string | null;
  album: string | null;
  /** Absolute URL; the Node gives relative paths for anything not from a service. */
  image: string | null;
  service: string | null;
  /** Seconds into the track, and its length — absent for live radio. */
  elapsed: number | null;
  duration: number | null;
  /**
   * Whether the Node will accept a seek for what is playing. Reported per track, and
   * false for live radio and for services that stream without a seekable position, so
   * it is a better test than "does it have a duration".
   */
  canSeek: boolean;
}

const FIELDS = [
  'state',
  'title1',
  'title2',
  'title3',
  'artist',
  'album',
  'image',
  'service',
  'secs',
  'totlen',
  'canSeek',
] as const;

type Field = (typeof FIELDS)[number];

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

function decode(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * Pull the fields we need out of the Node's status document. It is a flat list of
 * top-level elements, so this stays a targeted read rather than a general XML parser.
 */
export function parseStatus(xml: string, baseUrl: string): { now: NowPlaying; etag: string | null } {
  const values = {} as Record<Field, string | undefined>;
  for (const field of FIELDS) {
    values[field] = new RegExp(`<${field}>([\\s\\S]*?)</${field}>`).exec(xml)?.[1];
  }

  const etag = /<status[^>]*\betag="([^"]+)"/.exec(xml)?.[1] ?? null;
  const raw = values.state ?? 'stop';
  // BluOS reports 'stream' for services like Spotify Connect, 'play' for local playback,
  // and 'connecting' for the moment between tracks — which is emphatically not stopped.
  const state: PlayerState =
    raw === 'play' || raw === 'stream'
      ? 'playing'
      : raw === 'pause'
        ? 'paused'
        : raw === 'connecting'
          ? 'loading'
          : 'stopped';

  const number = (value: string | undefined): number | null => {
    if (value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  };

  const image = values.image ? decode(values.image) : null;

  return {
    etag,
    now: {
      state,
      // title1 is the track; title2/title3 stand in when the artist and album are absent.
      title: values.title1 ? decode(values.title1) : null,
      artist: values.artist ? decode(values.artist) : (values.title2 ? decode(values.title2) : null),
      album: values.album ? decode(values.album) : (values.title3 ? decode(values.title3) : null),
      image: image === null ? null : image.startsWith('http') ? image : `${baseUrl}${image}`,
      service: values.service ? decode(values.service) : null,
      elapsed: number(values.secs),
      duration: number(values.totlen),
      canSeek: values.canSeek === '1',
    },
  };
}

/** Transport actions, mapped to the Node's endpoints. */
export const ACTIONS = {
  play: '/Play',
  pause: '/Pause',
  next: '/Skip',
  previous: '/Back',
} as const;

export type Action = keyof typeof ACTIONS;

/**
 * Seeking is `/Play?seek=<seconds>` — the same endpoint as plain play, which is why it
 * is not in ACTIONS: it takes an argument and the others do not.
 */
export const seekUrl = (seconds: number) => `/Play?seek=${Math.max(0, Math.round(seconds))}`;
