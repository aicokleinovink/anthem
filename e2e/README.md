# End-to-end tests

Playwright driving the real UI, in a real browser, against **fake devices** — no receiver,
streamer or TV on the network, and nothing stubbed inside the page.

## Run it

```bash
npm install
npx playwright install chromium   # once
npm run e2e
```

`npm run ui` opens Playwright's UI mode instead — pick tests, re-run on save, step through
the DOM snapshot timeline. It re-runs the *test* on save, not the app: the suite serves
`frontend/dist`, so an edit under `frontend/src` needs a rebuild before the re-run means
anything.

The suite starts its own server: it builds the frontend and runs
[`api/scripts/serve-fake.ts`](../api/scripts/serve-fake.ts), which is `createApp` with fake
clients in place of the three real ones. That is one process on one port serving the built
UI and the API — the same shape production runs in, on 3100 rather than 3000 so a dev server
left running is never tested by accident.

## Why the fakes sit at the device layer

`createApp(receiver, player, tv)` already takes its clients as arguments, so the whole HTTP
surface, the event stream and the protocol translation can run for real against stand-ins.
Intercepting `/api/*` with `page.route` would test the frontend on its own and leave the
API's half of every interaction unverified — which is precisely the seam where things break.

**The receiver is a fake TCP server speaking the ASCII protocol**
([`api/test/fakes/receiver.ts`](../api/test/fakes/receiver.ts)) on an ephemeral port. That
keeps `transport/connection.ts` and the parser in the path, and lets a test assert that the
app wrote `Z1PVOL20;` — not `Z1VOL-70;`, which on the real unit does not land where you
asked. It reproduces two habits of the hardware on purpose:

- every change is **broadcast to every client**, which is what the UI's no-polling design
  rests on;
- `Z1VOL<n>` **does not set the volume**, so a client that uses it fails to move the level.

The streamer and the TV are stubbed at the class level instead. They speak HTTP and a
WebSocket protocol whose parsing is already covered by unit tests, and standing up fake BluOS
and webOS servers would cost a lot to prove little.

## The control surface

The fakes are driven over a **second HTTP server on port 3101**, deliberately not mounted on
the app — nothing test-only belongs in the thing under test. `tests/fixtures.ts` wraps it:

| | |
|---|---|
| `control.wire()` | every command the fake receiver was sent, e.g. `Z1VUP;` |
| `control.receiverState()` | what the fake receiver actually holds, after a write |
| `control.push(...frames)` | broadcast frames, as the front panel or another remote would |
| `control.player(now)` | report a track, or `null` for nothing loaded |
| `control.tv(available, current)` | report the set turning off, or landing somewhere |
| `control.tvSelections()` / `control.playerActions()` | what those two were asked to do |
| `control.stopApp()` / `control.startApp()` | take the app's HTTP listener away and bring it back |

The log is reset before each test, so a test only ever sees what it caused.

`stopApp` closes the listener **and destroys open connections**. Closing an HTTP server
only stops it accepting new ones; the event stream already in flight would stay open and
the UI would never notice the service had gone — which is the whole thing being tested.
The fakes and the receiver connection are untouched, so it is a service restart, not a
device going away.

## What is covered

Power, volume (stepping, an absolute set, press coalescing, mute), input selection, the
speaker-profile off-by-one and the hiding of unnamed slots, the front panel display
setting, the two device groups dispatching to the right device, now-playing, a change
pushed by the receiver landing without a reload, and losing the API and recovering from it.

Three more that are worth knowing the shape of:

- **`standby.spec.ts`** — the app's *other* lock. Standby reaches the same controls as
  offline by a different route (`powerOn === false` rather than a dead stream), so it can
  regress on its own; the card has to say Standby rather than Offline, and the power
  button has to stay live because it is the way out.
- **The drag in `player.spec.ts`** — `progress` is `drag ?? (expanded ? 1 : 0)`, so a
  click is only ever 0 or 1 and one layout is always the only one mounted. A half-finished
  drag is the *sole* state where both are in the DOM, which makes it the only way to test
  what `inert` is for. A click-driven version of that test passes with `inert` deleted.
- **`layout.spec.ts`** — geometry at 375pt, the width the app is actually used at. It
  asserts relationships rather than pixel counts: the title column gets exactly the
  remainder after artwork, transport, gap and padding, and a longer title changes neither
  the strip's height nor the transport's width. #57 sat as an unverified hunch for a week
  because nothing in the suite rendered the app this narrow.

## Writing tests

- **Query by role or label, never by class.** CSS Modules hash their class names, and a
  rename would break tests for no reason.
- **Poll for the wire, do not race it.** Writes are optimistic and the transport paces them
  by 75 ms on purpose, so the UI changes before the command lands: use
  `expect.poll(() => control.wire())`.
- One worker, no parallelism: there is one app process with one set of fakes behind it, so
  parallel tests would change the volume under each other.
- **Set up the state you are about to change.** The devices persist between tests, and
  selecting the input or profile that is *already* selected is a no-op — so a test that
  assumes a starting point passes without doing anything the moment something before it
  changes. `npx playwright test --repeat-each=3` catches this; three tests needed it.
- **Check a new test fails for its own reason.** Break the thing it covers and watch it
  go red — two tests here were written, passed, and turned out to be proving nothing
  until that check was run.
- **At 375pt, settle the animations before measuring.** Cards enter with a sideways
  slide, so the document is genuinely wider than the viewport while it runs; waiting on
  `document.getAnimations()` is the difference between a layout assertion and a
  screenshot of an animation.
- Out of scope here: screenshot regression (animations, plus the throttling described in
  CLAUDE.md, make snapshots flaky), error and reconnect paths, and anything needing hardware.

## Is it actually testing anything?

Break a control and see it fail. Making `commands.volumePercent` emit `Z1VOL` instead of
`Z1PVOL` fails *"an absolute set is written with PVOL, never VOL"* — and it fails on the
symptom, the dial never reaching −60 dB, rather than only on a string comparison.
