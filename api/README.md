# Anthem receiver control API

HTTP control for an **Anthem MRX 540** (software `00.80/00.04`) over its IP control
protocol. Phase one covers **power and volume**; the driver underneath is general enough
that inputs, listening modes and the rest are a route and a map entry each.

Everything here was developed against the actual unit at `192.168.2.3`, not against the
spec — see [Protocol notes](#protocol-notes), which is where the surprises live.

## Run it

```bash
cd api
npm install
cp .env.example .env      # ANTHEM_HOST defaults to 192.168.2.3
npm run dev
```

```bash
npm run probe             # read-only: replay every query against the receiver
npm test                  # unit tests, no hardware needed
```

The receiver must have **standby IP control enabled**, or it will not answer while it is
off — which also means power-on over IP will not work.

## Serving the UI

If `../frontend/dist` exists, the service also serves it: static assets with a long
immutable cache (Vite fingerprints their filenames), and `index.html` for any other GET so
deep links work. That makes the whole thing one process on one port. With no build present
it logs that and serves the API alone, which is the normal case in development.

`FRONTEND_DIR` overrides the location. The default is resolved from the working directory
rather than from the source file, because after `tsc` the compiled file sits a directory
deeper and a relative hop from it would miss.

## Endpoints

`:zone` is `1` or `2`. The `/api/...` forms without a zone are aliases for zone 1.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ connected, model, software, host, port }` |
| GET | `/api/state` | | the full cached state |
| GET | `/api/zones/:zone/power` | | `{ power }` |
| PUT | `/api/zones/:zone/power` | `{ "power": true }` | `{ power }` |
| POST | `/api/zones/:zone/power/toggle` | | `{ power }` |
| GET | `/api/zones/:zone/volume` | | `{ db, percent, muted, maxDb }` |
| PUT | `/api/zones/:zone/volume` | `{ "db": -60 }` or `{ "percent": 30 }` | `{ db, percent, muted, maxDb }` |
| POST | `/api/zones/:zone/volume/step` | `{ "steps": 3 }` (negative = down, 1 step = 1 dB) | `{ db, percent, muted, maxDb }` |
| PUT | `/api/zones/:zone/mute` | `{ "muted": true }` or `{ "toggle": true }` | `{ muted }` |
| GET | `/api/zones/:zone/inputs` | | `{ inputs: [{ input, name }], selected, format }` |
| PUT | `/api/zones/:zone/input` | `{ "input": 3 }` | `{ selected }` |
| GET | `/api/zones/:zone/speaker-profiles` | | `{ profiles, input, inputName, selected }` |
| PUT | `/api/zones/:zone/speaker-profile` | `{ "profile": 1 }` (optionally `"input"`) | `{ input, selected }` |
| GET | `/api/display` | | `{ info, options }` |
| GET | `/api/events` | | Server-sent events: the whole state, on connect and on every change |
| POST | `/api/player` | `{ "action": "play" \| "pause" \| "next" \| "previous" }` | `{ action }` |
| PUT | `/api/display` | `{ "info": 0 }` | `{ info, options }` |

```bash
curl localhost:3000/api/volume
curl -X PUT localhost:3000/api/volume -H 'content-type: application/json' -d '{"db":-60}'
curl -X POST localhost:3000/api/volume/step -H 'content-type: application/json' -d '{"steps":-3}'
```

Every response reports the level the **receiver confirmed**, never an echo of the request.

`/api/inputs` answers with everything the inputs UI needs in one call: the list, what is
selected, and the format of the arriving signal (`Z1AIN?`, e.g. `Dolby D+` or `No Signal`).
Input names are read once with `ISnIN?` and cached — they only change when someone renames
an input in the receiver's setup, and each one costs a paced command.

Errors: `400 bad_request` (with the zod issues), `502 device_command_error` (the receiver
rejected the command), `503 device_offline` (unreachable or no reply in 3 s).

## Volume limits

The receiver has its own **Maximum Volume** setting, and that is what governs how loud it
will actually go — a request for -40 dB lands at whatever that setting allows. It is the
right place to set the limit: it applies to the remote and the front panel too, not just
to this API.

`MAX_VOLUME_DB` is therefore **off by default**. Set it in `.env` if you want the API to
clamp below the receiver's own limit; whatever is in effect is reported as `maxDb` on every
volume response, and a step-up stops there rather than walking past.

## The event stream

`GET /api/events` is how the UI reads state; the REST endpoints above are for writing (and
for scripts and Shortcuts).

The receiver pushes every change to every connected client — verified by watching one
connection while another changed things: volume, input, speaker profile and the front panel
setting all arrived unasked within about 50 ms. So this service never polls the receiver.
It reads the full picture once on connect (`Receiver.refresh`), then keeps its cache up to
date from those pushes and forwards a complete snapshot to each client whenever anything
moves. Frames are coalesced over a 30 ms window, since one volume change arrives as two.

A `ping` event goes out every 10 s. That is not only to keep proxies from dropping an idle
stream — it gives clients something to *miss*, because a proxy can hold the connection open
after this service dies and the only symptom is silence.

## Now playing

The receiver has no idea what is playing — audio just arrives on an input — so the track,
artwork and position come from the **streamer**, not from the receiver. Here that is a
Bluesound Node, whose local HTTP API on port 11000 needs no authentication and reports
whatever it is playing: Spotify, Tidal, radio, Airplay, local files.

`PLAYER_URL` points at it (empty disables the player entirely). The service follows it with
BluOS long-polling — `GET /Status?timeout=60&etag=…` holds the request open until something
changes — and folds the result into the same snapshot the event stream sends.

One catch worth knowing: **the etag does not change as the position advances.** A long-poll
can sit for a minute while the track quietly plays on, so the elapsed time has to be counted
locally by the client and re-synced whenever an update does arrive.

Transport goes to the Node's `/Play`, `/Pause`, `/Skip` and `/Back`.

`connecting` — what the Node reports between tracks — is mapped to a `loading` state rather
than to `stopped`. Treating it as stopped makes the player vanish and reappear on every
skip.

## Speaker profiles

Speaker profile is a **per-input** setting — the same thing as Setup > Inputs > *input* >
Speaker Profile in Anthem's own app. `PUT /api/speaker-profile` applies to whatever input
the zone is currently on unless you name one.

These commands are not in the parts of the protocol doc I worked from; they came from
reading the receiver's own web app at `http://<receiver>/js/merged.min.js`, which speaks
this same protocol:

- `SSSP<n>0?;` -> the name of profile n (1-based). On this unit: `Center`, `Corner`, then
  the unnamed `Profile3` / `Profile4` slots.
- `IS<input>SP?;` / `IS<input>SP<value>;` -> the profile assigned to an input. **The value
  is 0-based while profile numbers are 1-based** — `IS3SP1` means input 3 uses profile 2,
  Corner. The web app does exactly this: `current_profile = value + 1`.

Verified end to end against the receiver, including reading a value back after writing it.

## Front panel display

`GCFPDI` is Setup > General > Front Panel Displayed Info: **0 = All, 1 = Volume Only**.
Also found by reading the receiver's own web app — both the command name and the option
labels, which the device itself never sends.

## Protocol notes

Raw TCP on port **14999**, ASCII, every command and reply terminated by `;`.
Set is `Z1POW1;`, query is `Z1POW?;`, and both are answered in set form. Rejected commands
come back as `!I<command>`. The receiver also **pushes** status frames whenever anything
changes at the front panel or on the remote, which is why this holds one long-lived socket
and folds every frame into a cache instead of polling.

Three things the hardware does that the obvious reading of the spec does not predict — each
one cost a live debugging round, so they are worth keeping written down:

1. **`Z1VOL<n>;` is not a usable absolute setter.** `Z1VOL-50;` from -70 dB left the unit at
   -78 dB; `Z1VOL-75;` from -78 dB left it at -87 dB. The value is not taken as a target and
   the result is not reproducible. `Z1VOL?;` *is* the authoritative dB readout, so this code
   reads dB with `Z1VOL?;` and writes with `Z1PVOL`, which is exactly absolute
   (`Z1PVOL30;` lands on -60.0 dB every time).
2. **`Z1VUP;` / `Z1VDN;` take no argument** and move exactly 1 dB. `Z1VUP1;` is rejected.
   So a step of N is N commands.
3. **The receiver silently drops commands sent back-to-back.** A burst of
   `Z1VOL?;Z1MUT?;Z1VDN;Z1VDN;Z1VUP;Z1VDN;` was answered as though only the first three had
   been sent — no error, just missing work. The transport therefore paces writes with a
   75 ms minimum gap (`MIN_COMMAND_GAP_MS` in `src/transport/connection.ts`). Without it,
   multi-step volume changes lose steps and time out.

4. **Right after power-on the receiver ignores volume commands for a few seconds** while it
   starts up — `Z1PVOL20;` times out and `Z1VUP;` comes back rejected, then everything works
   normally. This is not retried automatically, because a retry would also paper over a
   genuinely offline receiver; if you script a power-on followed by a volume set, leave a
   few seconds between them or retry on `503`/`502` yourself.

Percent and dB are the same scale: `percent === dB + 90`, across -90 .. +10 dB.

## Layout

```
src/
  config.ts              env-driven config and the volume range
  app.ts / index.ts      express wiring and entrypoint
  transport/connection.ts  persistent socket: reconnect, framing, paced writes, correlation
  protocol/commands.ts   the command map — single source of protocol truth
  protocol/parse.ts      frame splitting and parsing
  device/receiver.ts     power/volume/mute operations
  device/state.ts        cache fed by replies and pushed frames alike
  device/volume.ts       dB <-> percent, clamping
  routes/                power, volume, system
scripts/probe.ts         read-only protocol probe against the real unit
```

## Not built yet

Input select (`Z1INP`, names via `ISnIN?`, count via `ICN?` — your unit reports 4),
listening mode (`Z1ALM`), zone 2 volume routes, tone/subwoofer trim, ARC on/off,
tuner presets, signal info (`Z1AIN` — currently reporting `Dolby D+`), plus an SSE stream
of pushed state changes and receiver discovery. Each is a small addition on this base.
