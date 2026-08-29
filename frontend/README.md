# Anthem remote

A web remote for the Anthem MRX 540, styled after the Dribbble "Watch UI kit" reference —
monochrome, white cards on near-black, heavy numerals, thin round-capped arcs, solid black
circular buttons.

A toolbar sits above the card: **Volume**, **Inputs** and **Settings** swap the card
beneath it, and the **power button** on the right turns the receiver on and off.

Vite + React + TypeScript. It talks to the Express API in `../api`, which owns the TCP
connection to the receiver (a browser cannot open raw sockets).

## Run

```bash
cd ../api && npm run dev     # must be running first
cd ../frontend && npm run dev
```

`vite.config.ts` proxies `/api` → `http://localhost:3000`, so the page is same-origin and
there is no CORS to configure.

On your phone: `npm run dev -- --host`, open `http://<your-mac>:5173`, then Add to Home
Screen — it opens full-screen without Safari chrome.

## Sections and power

Each control section is its own card on a shared shell (`components/Card.tsx`), so adding
one is a component plus an entry in `SECTIONS` in `components/Toolbar.tsx`.

The selected tab's black pill is a **single element that slides** between tabs rather than a
background on each one — that is what makes the move animatable. Its position and width are
measured from the active tab (the labels are different widths) and kept correct by a
ResizeObserver. It stays hidden until the first measurement, so on load it fades in under
the right tab instead of sliding in from the left.

**One hook shape for everything.** `hooks/usePolled.ts` holds the pattern every control
shares: poll the API for the truth, write optimistically, adopt what the receiver confirms,
and roll back if the write never landed. Power, inputs, speaker profile and display are all
thin wrappers over it. This is not only tidiness — the rollback used to be written out per
hook and three of the four had quietly omitted it, leaving the UI showing a selection the
receiver had never accepted. (`useVolume` stays separate: its press-coalescing is genuinely
different.)

**Device state lives in `App.tsx`, not in the cards.** `useVolume` and `usePower` are held
above the section switch and passed down, so they keep polling while another card is on
screen. A hook inside `VolumeCard` would be unmounted on every tab change and the card
would flash "connecting" and re-fetch each time you came back to it.

The power button reads the receiver's real state (polled every 4 s, slower than volume
since power rarely changes) and writes `PUT /api/power`. It is optimistic — the icon fills
the moment you press — and corrects itself from whatever the receiver confirms.

When the receiver is in standby the volume card says **Standby** and disables its buttons,
rather than reporting "Offline" as though the network were down. Worth knowing: for a few
seconds after power-on the receiver ignores volume commands while it starts up, so the card
may briefly show an error right after you switch it on.

## Offline

Every control disables when the app cannot reach the API — the volume buttons, both
pickers, and the power button, which used to stay live on its last known state. `App.tsx`
computes one `offline` flag from all the hooks (they all talk to the same API, so if one
cannot reach it, none of them can) and passes it down.

The toolbar tabs stay enabled on purpose: they are navigation, not receiver controls, and
locking them would trap you on whichever card happened to be open.

## Motion

Cards **swing in from the side you moved towards** in the toolbar: pushed back in depth and
turned away on the Y axis, then rotating flat with a slight overshoot as they land. The
contents cascade in behind — header, then dial, then buttons — which makes the card read as
assembling rather than as one flat panel appearing. The perspective is applied per element
rather than on the shell, so the toolbar above is unaffected.

Two things to know if you change this:

- Every card is the same height (`--card-height`, the natural height of the tallest one), so
  swapping sections never resizes the surface under your thumb.
- The content stagger is per `nth-child`, and the rules have to cover **every** child a
  card can have. When the settings card grew to five children, the two beyond the rules
  fell back to no delay and animated in first — the bottom of the card arriving before the
  top.
- The cards need distinct React `key`s. Inputs and Settings are the same component in the
  same slot, so without them React reuses the instance and the entrance silently stops
  replaying between those two.

## Inputs

The sources are read from the receiver, names and all — on this unit: HDMI 1, Airplay,
TV / PlayStation, Streamer. Tapping one switches it, optimistically, then corrected by what
the receiver confirms.

Selection uses **the toolbar's sliding pill turned on its side**: one element that moves
between rows rather than a background on each, with the same overshoot easing, so the two
navigations feel like one idea. It lives in `components/PillList.tsx` and is shared with the
speaker-profile picker.

The header shows the format of the signal actually arriving (`Dolby D+`, `2.0 PCM`,
`No Signal`), and when something *is* playing three small bars animate on the selected row.
They are hidden entirely when there is no signal — as a static trio they read as an
ellipsis rather than as an indicator.

## Settings

Two settings, each in its own thin-outlined panel so they read as separate things rather
than one long stack of rows.

**Speaker Profile** is a **per-input** setting on this receiver. The card header already
names the input it applies to, and it follows whatever input is selected. Switching
profile here is the same action as Setup > Inputs > *input* > Speaker Profile in Anthem's
app — the workflow this replaces.

**Display** is Front Panel Displayed Info — All or Volume Only.

The receiver always reports four profile slots. The ones nobody has renamed come back as
`Profile3` / `Profile4`, so the card hides those and shows the named ones (here: Center and
Corner). If none have been renamed it shows all four rather than an empty list, and naming a
third profile on the receiver makes it appear on its own.

## What the percentage means

The dial shows the receiver's **full scale**: 0% at −90 dB, 100% at +10 dB. The receiver's
own percent readout is exactly `dB + 90`, so the number on the dial is the number the
receiver reports — nothing is rescaled behind your back, and the real dB sits under it.

A normal listening level therefore sits low on the arc (−81 dB reads 9%), which is simply
true. How loud it will actually go is the receiver's own **Maximum Volume** setting; the
`+` button stops moving the level once you reach it. If you set `MAX_VOLUME_DB` in the API,
the button also disables at that point.

## How it behaves

- One press = one step = 1 dB.
- Mute is shown, not controlled: mute from the physical remote and the arc greys with a
  "· muted" caption, so the level on screen is never misleading.
- **Presses are coalesced.** The number moves immediately, but while a request is in flight
  further presses accumulate and go out as a single `{ steps: N }`. This is deliberate: the
  receiver silently drops commands that arrive too fast (see the API README), so flooding it
  loses steps. Verified — five fast presses land exactly 5 dB away.
- Polls every 2 s, so the dial follows the physical remote. The server's value always wins
  over the optimistic one. Polling pauses while the tab is hidden; the first load runs
  regardless, so a backgrounded tab still opens on the real level.
- If the API goes away the card dims to "Offline" and the buttons disable; it recovers on
  its own when the API returns, without a reload.

## Press animation

Every press sends two thin grey rings out from the dial: **outward on `+`, inward on `−`**,
so the motion itself carries the direction. The second ring follows 120 ms behind the first,
which reads as one gesture rather than two separate pulses, and both fade as they travel.
The card's rounded edge clips them, so they dissolve into it rather than escaping.

The rings are painted *behind* the arc, the number and the buttons (`z-index: -1` inside the
card's own stacking context). Two details worth keeping in mind if you tweak this:

- The `animation` shorthand resets `animation-delay`, so the trailing ring's delay has to be
  declared *after* the direction rules and at matching specificity — otherwise both rings
  land exactly on top of each other and the stagger silently disappears.
- The easing is deliberately gentler than the buttons' expo-out. A sharp curve makes a ring
  rush out and then hang almost still while it fades, which looks stalled.

Nothing is rendered at all when the viewer prefers reduced motion.

## Accessibility

The toolbar is a real tablist: tabs carry `role="tab"` with `aria-selected`, and the card
below is the `tabpanel` they control, labelled by the active tab. Buttons carry labels
(`Volume up`, `Turn receiver off`) and selected rows use `aria-pressed`. Every animation is
dropped under `prefers-reduced-motion`.

## Styling

**CSS Modules, one file per component, sitting next to it** — `Card.module.css` beside
`Card.tsx`. Class names are scoped and written short (`.card`, `.header`, `.pill`), since
nothing outside the file can see them. Vite handles this natively; no dependency, no
runtime.

`styles/global.css` is the only global sheet and holds two things that genuinely cannot
be scoped: the design tokens (`--ink`, `--card`, `--card-height`, …) with the reset, and the
two card-entrance keyframes — the *direction* is chosen by the app shell but applied to the
card, and it travels as `--card-enter`, which CSS Modules leaves alone inside `var()`.

**Every other keyframe belongs inside the module that uses it.** CSS Modules rewrites
`animation-name` to a hashed local name, so a module referencing a keyframe defined in a
global sheet resolves to nothing and simply does not animate — silently, with no warning.
That is how the card's content stagger was lost when the styles were first split up.

Where a component needs to find its own element (the sliding pills measure the active one),
it queries with the imported class — `container.querySelector('.' + styles.rowActive)` —
so the hashed name is never written by hand. That measuring lives in
`hooks/useSlidingPill.ts`, shared by the toolbar and the pickers.

The pill's transition is switched on **one tick after** its first position is applied.
Otherwise the initial measurement animates the pill from the container's corner into
place, so every card would slide its pill in on load.

## Files

```
src/api.ts                     typed client for the API
src/hooks/usePolled.ts         poll / optimistic write / rollback, shared by four controls
src/hooks/useVolume.ts         volume polling and press coalescing
src/components/                Card, Panel, Toolbar, PowerButton, PillList, VolumeDial, …
src/cards/                     one card per toolbar section
src/styles/global.css          tokens, reset, shared keyframes
```

No web font is loaded: the system stack renders as SF Pro on iOS, which is what the
reference approximates, and nothing breaks when the phone is offline.
