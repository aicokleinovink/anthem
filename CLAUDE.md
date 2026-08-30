# Working on this project

A remote for an Anthem MRX 540 and the devices around it. `api/` owns the connections and
exposes HTTP + an event stream; `frontend/` is the React app. Both READMEs are detailed —
read them before changing protocol or transport code, because most of what is written there
was learned the hard way from the hardware and is not in any published document.

## The devices

| | | |
|---|---|---|
| `192.168.2.3` | Anthem MRX 540 | ASCII protocol, TCP 14999. Also has a web UI on 80 |
| `192.168.2.15` | Bluesound Node Nano | BluOS HTTP API on 11000 — now playing, transport |
| `192.168.2.6` | LG TV (webOS) | SSAP over WebSocket on 3000 |

Addresses and the TV client key live in `api/.env`, which is **gitignored** — `.env.example`
shows the shape. Re-pair the TV with `npm run pair-tv` if the key is ever lost.

Also on the network, unused so far: a KPN TV box (`192.168.2.1`, Google TV/Cast), a
Chromecast (`.4`), two AirPlay devices (`.8`, `.9` — one is probably the Apple TV on the
LG's HDMI 4), and the KPN router (`.19`, `.254`).

## Things that will bite you

The receiver:

- **`Z1VOL<n>;` is not a usable absolute setter.** Volume is written with `Z1PVOL`.
- **`Z1VUP;`/`Z1VDN;` take no argument** and move exactly 1 dB.
- **It silently drops commands sent back-to-back** — no error, just missing work. The
  transport paces writes with a minimum gap; do not remove that.
- Speaker profile values are **0-based** while profile numbers are 1-based.
- It **pushes every change to every client**, which is why nothing polls it.

The frontend:

- **CSS Modules rewrites `animation-name`**, so a module referencing a keyframe defined in
  a global sheet silently animates nothing. Keyframes live with the module that uses them.
- **`EventSource` abandons a stream permanently on a non-200** — what a proxy returns while
  the API restarts. Reconnection is ours, on purpose.
- The card content stagger is per `nth-child`; rules must cover **every** child a card can
  have, or extra sections animate in first.

The streamer:

- Its etag **does not change as the track position advances**, so elapsed time is counted
  locally and re-synced on updates.

## How to find undocumented commands

Speaker profiles and the front panel setting are not in Anthem's published protocol. They
came from reading the receiver's own web app:

```bash
curl -s http://192.168.2.3/js/merged.min.js > /tmp/merged.js   # ~700KB, minified
```

Its `COMMAND` object and `handle_*_commands` functions map every wire command to a meaning.
The same trick works for anything else the unit's UI can do but the docs do not mention.

## Conventions

- **Verify against the hardware.** Nearly every assumption made from the spec turned out
  wrong. Probe first, then build.
- **Leave the devices as you found them.** Note the volume, input and profile before
  testing and restore them after.
- No dependencies unless there is a real reason; the TV and receiver protocols are both
  implemented directly.
- Styles are CSS Modules beside their component. `styles/global.css` holds only tokens, the
  reset, and the two card-entrance keyframes.
- Comments explain *why*, especially where the hardware forced a choice.

## Running and checking

```bash
npm run dev                    # both servers; open :5173, not :3000 (see below)
cd api && npm test             # 27 tests, no hardware needed
cd api && npm run probe        # read-only protocol probe against the real receiver
```

`npm run dev` at the root starts `tsx watch` in `api/` and Vite in `frontend/`, clears
both ports first, and kills both process groups on Ctrl+C. **Open :5173** — the API on
:3000 serves `frontend/dist`, so on its own it shows the last build, which after a branch
switch is silently stale.

For a single process on one port: build the frontend, then `npm run build && npm start` in
`api/`.

## When testing in a browser

- **Never inject DOM into React-managed elements** — it breaks reconciliation and looks
  like an app bug. It cost real time once already.
- The automated browser pane often reports `document.hidden`, so timers are throttled,
  CSS transitions do not advance, and `requestAnimationFrame` never fires. Read state from
  the DOM rather than trusting a screenshot taken mid-animation.
- **Kill stray dev servers.** Several times a "bug" was an old process still on port 3000.
