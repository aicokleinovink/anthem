# Anthem remote

Control an **Anthem MRX 540** AV receiver from a phone or a browser, over the receiver's
own IP control protocol.

Two parts:

- **[`api/`](api)** — a Node/Express service that owns a long-lived TCP connection to the
  receiver and exposes it as HTTP. A browser cannot open raw sockets, so this is what makes
  a web UI possible at all.
- **[`frontend/`](frontend)** — a small React app: a volume dial, an input picker, and the
  two settings that actually get used day to day.

Everything here was built and verified against a real MRX 540 (software `00.80/00.04`),
not against a spec. Several of the receiver's behaviours contradict the obvious reading of
the protocol, and those are written down where they bite — see
[api/README.md](api/README.md#protocol-notes).

## Run it

**One process, one port** — the API serves the built UI:

```bash
cd frontend && npm install && npm run build
cd ../api && npm install && cp .env.example .env   # ANTHEM_HOST defaults to 192.168.2.3
npm run build && npm start
```

Open `http://localhost:3000`. From your phone, use the machine's LAN address —
`http://<your-machine>:3000` — then Add to Home Screen.

**While developing**, run the two separately so the UI hot-reloads. Vite serves the app and
proxies `/api` to the service, which then skips serving any build it finds:

```bash
cd api && npm run dev
cd frontend && npm run dev
```

The receiver needs **standby IP control enabled**, or it will not answer while it is off —
which also means power-on over IP will not work.

## What it does

| | |
|---|---|
| **Volume** | Circular gauge on the receiver's own 0–100 scale, `−` / `+` in 1 dB steps, mute shown when set elsewhere |
| **Inputs** | The real source list with your names, and moving bars on the one that is playing |
| **Settings** | Speaker profile (per input) and front panel displayed info |
| **Power** | On/off from the toolbar, with a standby state the cards respect |
| **TV** | Switch the LG television between HDMI 1, PlayStation, YouTube and Netflix |
| **Now playing** | A strip under every card — artwork, track, position, skip — that expands into a full player |

Every reading comes from the receiver and every write is confirmed by it — nothing in the
UI is an echo of what was requested.

## Things worth knowing

- **`Z1VOL<n>;` is not a usable absolute setter** on this firmware. Volume is written with
  `Z1PVOL` instead. ([why](api/README.md#protocol-notes))
- **The receiver silently drops commands sent back-to-back**, so the transport paces writes
  with a minimum gap. Without it, multi-step changes quietly lose steps.
- **Speaker profiles and the front panel setting are not in the published protocol.** Both
  were found by reading the receiver's own web app, which speaks the same protocol.
- Speaker profile values are **0-based** while profile numbers are 1-based.
- **The receiver pushes every change to every connected client**, so the UI reads a single
  event stream and never polls. Change the volume on the remote and the dial moves within
  about 50 ms.
- **The television is controlled directly**, over webOS SSAP on the set itself — no LG
  account, no dependency. It cannot be switched *on* that way, though: that needs
  Wake-on-LAN. ([details](api/README.md#the-television))
- **Now-playing information does not come from the receiver** — it cannot know what is
  playing. It comes from the streamer feeding it (a Bluesound Node), over that device's own
  local API. ([details](api/README.md#now-playing))

## Tests

```bash
cd api && npm test                        # protocol parsing, commands, state cache, transport
cd e2e && npm install && npm run e2e      # the real UI, end to end, against fake devices
```

Both run without hardware. The end-to-end suite is Playwright driving the built app while
the API talks to a **fake receiver speaking the ASCII protocol over TCP** — so the transport,
the parser and the event stream are all in the tested path, and a test can assert on the
bytes that went out. See [e2e/README.md](e2e/README.md).

`npm run probe` in `api/` replays every read-only query against the real receiver and prints
what comes back.

## Notes

- Give the receiver a **DHCP reservation** on your router. Its address is configured in one
  place, but if it ever changes nothing will work and the reason will not be obvious.
- Don't expose the API to the internet — it has no authentication. For access from outside
  the house, use Tailscale, which also provides a real HTTPS certificate that a plain LAN
  address cannot.
