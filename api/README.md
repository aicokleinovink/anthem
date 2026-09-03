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
| GET | `/api/zones/:zone/sound` | | `{ controls: [{ key, label, db }], minDb, maxDb, stepDb }` |
| PUT | `/api/zones/:zone/sound` | any of `{ "bass": 4.5, "treble": -3, "subwoofer": 2 }` | `{ controls, minDb, maxDb, stepDb }` |
| GET | `/api/display` | | `{ info, options }` |
| GET | `/api/events` | | Server-sent events: the whole state, on connect and on every change |
| POST | `/api/player` | `{ "action": "play" \| "pause" \| "next" \| "previous" }`, or `{ "action": "seek", "seconds": n }` | `{ action }` |
| PUT | `/api/display` | `{ "info": 0 }` | `{ info, options }` |
| PUT | `/api/tv` | `{ "target": "netflix" }` | `{ target }` |

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

## The television

An LG webOS set, over its local SSAP protocol: JSON on a WebSocket, no cloud and no LG
account. Node's built-in WebSocket client is enough, so this needs no dependency — a plain
manifest works for prompt-based pairing, without LG's signed one.

Pair once, with the set on:

```bash
npm run pair-tv
```

Accept the prompt with the remote and put the key it prints in `.env` as `TV_CLIENT_KEY`,
alongside `TV_HOST`. Later connections present that key and pair silently. Leave either
empty and the TV section simply does not appear.

What the card offers is `src/tv/targets.ts` — edit that list to change the pills. The ids
came from asking the set itself (`ssap://tv/getExternalInputList` and `listLaunchPoints`),
and inputs and apps are launched the same way, only the payload differs. Which one is on
screen comes from a **subscription** to `getForegroundAppInfo`, so the selection follows the
TV even when you change it with its own remote.

**The set cannot be switched on this way.** With the TV off there is no network stack to
talk to; that needs Wake-on-LAN and *Mobile TV On* enabled on the set. Until then the card
shows "Off" and disables itself.

### Remote keys travel on a second socket

Directional keys are **not part of SSAP's request surface**. The set hands out a separate
WebSocket for them, and only per session:

```
ssap://com.webos.service.networkinput/getPointerInputSocket
  -> payload.socketPath = ws://<host>:3000/resources/<hash>/netinput.pointer.sock
```

That socket takes newline-delimited text rather than JSON, and the trailing blank line is
required:

```
type:button\nname:UP\n\n
```

`src/tv/keys.ts` holds the app's names and LG's spelling of them; nothing outside it knows
the wire names, the same way nothing outside `protocol/` knows `Z1PVOL`. The socket is
opened on the first press and dropped with the connection, because the address does not
outlive the session.

**This needs `CONTROL_MOUSE_AND_KEYBOARD` in the manifest, and therefore a re-pair.** The
permissions a client key carries are fixed when the key is paired, so a key from before
that permission was added gets `401 insufficient permissions` for the request above while
every other request on the same key keeps working — which reads like a broken request
rather than a stale key. `src/tv/manifest.ts` is the single copy of the manifest for
exactly this reason: `pair-tv` and the running app must present the same list. Old and new
keys coexist on the set, so re-pairing does not disturb anything else.

### OLED pixel brightness, and the alert bridge

`picture.backlight` is the setting the TV's own menus call OLED Pixel Brightness, 0-100.
**Reading it is ordinary; writing it is not.**

```
settings/getSystemSettings {category:'picture', keys:['backlight']}   -> {"backlight":100}
settings/setSystemSettings {category:'picture', settings:{...}}       -> 401, even with
                                                                         WRITE_SETTINGS
```

Picture writes are reserved for the set's own apps. What does work — probed on the real
set, 100 → 90 → 100 — is to have the TV make the change *itself*: `createAlert` carries a
`luna://com.webos.settingsservice/setSystemSettings` action, and `closeAlert` fires it, so
the call runs with the TV's own authority. The alert's message is a single space and it is
closed immediately, so nothing readable reaches the screen.

That is a hack on a private interface and LG can remove it in a firmware update. When
they do, `setBacklight` throws and the card stops working; nothing else breaks, and the
d-pad still reaches the same setting the long way round.

Two more things about this corner:

- **`keys` must contain only keys the category has.** One wrong name fails the whole
  request with `500 Application error`, which reads as a broken service rather than as a
  typo. That cost a detour.
- **There is no subscription for it.** The value is read on connect and again after each
  write, so a change made with the set's own remote is not noticed until then. Brightness
  moves as a *step*, never as a level, so the app can never overwrite the set with a
  stale number.
- **The set applies the change a beat after the alert closes.** A read taken straight
  afterwards returns the *old* value — which then goes out on the stream and yanks the
  number on screen back to where it was. `stepBacklight` waits before confirming, and
  only once the presses have stopped.
- **Presses have to accumulate, not queue.** They arrive faster than the bridge carries
  them, and two writes that each read the set's current value both compute the same
  target: three quick presses land as one step of ten. So the pending *target* is what a
  press is added to, one write at a time drains it, and pressing faster than the set can
  keep up loses nothing. Same shape as the receiver's volume coalescing, for the same
  reason.
- **The settling wait needs the drain loop wrapped around it, not after it.** A press
  that lands *during* the wait finds a write already in progress and returns without
  writing — so if the loop had already ended, that target was never sent and every
  client was left showing a value the set did not have. Drain, settle, and go round
  again if anything arrived while settling.
- **A refused write must put the value back.** The target is published before it is
  written, so when the bridge fails the API asks the set what it actually holds rather
  than leaving clients on a write that never landed. If even the read fails it reports
  nothing, which the card draws as `––`.

Two findings from the real set worth not re-learning:

- **The settings menu is an overlay, not an app.** `menu` opens it and `back` closes it,
  but `getForegroundAppInfo` keeps reporting whatever app is behind it. Nothing can detect
  that the menu is open. There is no settings launch point either — `listLaunchPoints`
  returns 18 apps and none of them is one — so `menu` is the only route to it.
- **Keys are context-dependent.** In a video player the arrows seek instead of moving a
  highlight, so probing the d-pad while something is playing scrubs the picture and
  measures nothing. Probe from the home screen.

Whether the set drops keys sent back-to-back the way the receiver does is **not
established**; `sendKey` paces them 60 ms apart as cheap insurance, and the comment there
says what would settle it. The pacing *claims* its slot before waiting rather than
stamping the clock afterwards — read-sleep-stamp lets two overlapping presses compute the
same gap, sleep it together and send in the same tick, which is no pacing at all in
exactly the case it exists for.

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

Transport goes to the Node's `/Play`, `/Pause`, `/Skip` and `/Back`. **Seeking is the same
`/Play` endpoint with a `seek=<seconds>` query**, which is why it is not in the same table of
actions as the others: it takes an argument and they do not.

Whether the current track can be seeked at all is the Node's own `canSeek`, reported per
track and passed straight through to the client. It is false for live radio and for services
that stream without a seekable position, which makes it a better test than asking whether
the track has a length.

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

## Tone and subwoofer trim

Bass, treble and the subwoofer channel level, for the main zone. Also absent from the
protocol doc, and also found in the receiver's own web app, whose `COMMAND` object names
them `Z_TON0` (bass), `Z_TON1` (treble) and `Z_LEV1` (subwoofer level):

- `Z1TON0?;` / `Z1TON0<db>;` — bass
- `Z1TON1?;` / `Z1TON1<db>;` — treble
- `Z1LEV1?;` / `Z1LEV1<db>;` — subwoofer

Unlike `Z1VOL`, these **are** exact absolute setters — `Z1TON0-2.5;` lands on -2.5 dB and
reads back as `Z1TON0-2.5`. The range is **-10.0 .. +10.0 dB on a 0.5 dB grid**, which is
also what the web app puts on its sliders.

**The receiver rejects an illegal value rather than clamping it.** `Z1TON015;` and
`Z1TON00.25;` both came back as `!E...` with the level unchanged — so `device/tone.ts`
rounds and clamps before anything reaches the wire. The route refuses an out-of-range
number outright (400): a slider cannot produce one, so a request that does is a mistake.

Values are written with one decimal, which is the form the receiver itself uses: it accepts
`Z1TON05;` but answers `Z1TON05.0`. Changes are pushed to every connected client like
everything else, verified with two sockets open at once.

Anthem's app exposes the other channel levels too (`Z_LEV5` front, `Z_LEV7` center,
`Z_LEV8` surround, `Z_LEVD` LFE, and the heights) on the same pattern; only these three
are wired up.

## Front panel display

`GCFPDI` is Setup > General > Front Panel Displayed Info: **0 = All, 1 = Volume Only**.
Also found by reading the receiver's own web app — both the command name and the option
labels, which the device itself never sends.

## Protocol notes

Raw TCP on port **14999**, ASCII, every command and reply terminated by `;`.
Set is `Z1POW1;`, query is `Z1POW?;`, and both are answered in set form. Rejected commands
come back prefixed with `!` — `!I<command>` for one it does not understand, `!E<command>`
for one it understands but will not accept (a tone value off the 0.5 dB grid, say). The receiver also **pushes** status frames whenever anything
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
  device/tone.ts         the tone grid the receiver will accept
  device/volume.ts       dB <-> percent, clamping
  routes/                power, volume, system
scripts/probe.ts         read-only protocol probe against the real unit
```

## Not built yet

Input select (`Z1INP`, names via `ISnIN?`, count via `ICN?` — your unit reports 4),
listening mode (`Z1ALM`), zone 2 volume routes, the remaining channel trims, ARC on/off,
tuner presets, signal info (`Z1AIN` — currently reporting `Dolby D+`), plus an SSE stream
of pushed state changes and receiver discovery. Each is a small addition on this base.
