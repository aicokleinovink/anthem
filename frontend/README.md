# Anthem remote

A web remote for the Anthem MRX 540, in dark frosted glass — translucent panes over a
backdrop taken from the album art, in the idiom of iOS Control Centre and the Now Playing
sheet. Monochrome still: heavy numerals, thin round-capped arcs, circular buttons, light
labels on glass.

Two rows of chrome sit above the card. A **device switcher** — TV · Anthem — chooses
whose controls you are looking at, and the **section toolbar** below it swaps the card:
**Inputs** for the TV, **Volume**, **Sound**, **Inputs** and **Settings** for the
receiver. The
**power button** on the right of the toolbar turns the receiver on and off.

Vite + React + TypeScript. It talks to the Express API in `../api`, which owns the TCP
connection to the receiver (a browser cannot open raw sockets).

## Run

```bash
cd .. && npm run dev         # starts the API and Vite together
```

Then open **`http://localhost:5173`**, not `:3000`. Both ports serve the app, but only one
serves *this* working tree: `:5173` is Vite reading from source with hot reload, while the
API on `:3000` serves `frontend/dist` — whatever was last built, which after a branch
switch looks like the branch not working. `:3000` is for checking a build, nothing else.

`vite.config.ts` proxies `/api` → `http://localhost:3000`, so the page is same-origin and
there is no CORS to configure.

The two can still be started separately (`npm run dev` in `api/`, then here) when you want
one of them alone; the API must be up either way.

On your phone: the root command passes `--host`, so Vite prints a LAN address as well —
open `http://<your-mac>:5173` there and Add to Home Screen, and it opens full-screen
without Safari chrome, with the flag icon on its own tile.

The icons live in `public/`, which Vite copies to the root of `dist/`. `icon.svg` is the
source of the shape; the PNGs are rasterised from the same path by
`scripts/render-icons.py` (stdlib only — the repo has no image dependency), so adjust the
curve there and re-run it rather than editing a PNG:

```bash
python3 scripts/render-icons.py public
```

Two things iOS forces: the touch icon has to be a **PNG** (it ignores SVG), and it has to
be **opaque** — transparency is composited onto black, which is the tile the icon exists to
replace. Corners are not drawn either, because iOS applies its own squircle mask and a
rounded source ends up double-rounded.

## Devices and sections

Each control section is its own card on a shared shell (`components/shared/Card.tsx`), so adding
one is a component plus an entry in `SECTIONS` in `components/shared/Toolbar.tsx`.

`SECTIONS` is **per device**, not one flat list: it maps each device to the sections it
offers. `Inputs` appears under both and means that device's own sources — the TV's watch
targets, or the receiver's inputs — so it is the one section that carries across when you
switch device. Anything else falls back to the new device's first section.

The device switcher (`components/shared/DeviceSwitcher.tsx`) has no surface of its own:
plain text on the canvas, above the toolbar and closer to it than the toolbar is to the
card, so it reads as a heading over the section tabs rather than as a second set of them.
It is a group of `aria-pressed` buttons; the section tabs remain the tablist that owns the
card below.

**The TV's lone tab is rendered without the sliding pill.** A pill that cannot move looks
broken, so the single active tab paints the pill's background on itself and
`useSlidingPill` is not measured at all — it is only meaningful with two or more tabs.

The selected tab's black pill is a **single element that slides** between tabs rather than a
background on each one — that is what makes the move animatable. Its position and width are
measured from the active tab (the labels are different widths) and kept correct by a
ResizeObserver. It stays hidden until the first measurement, so on load it fades in under
the right tab instead of sliding in from the left.

**Nothing polls.** `hooks/useReceiver.ts` opens one `EventSource` on `/api/events` and the
whole app renders from the snapshots it delivers. The receiver pushes its own changes, so
touching the physical remote updates the UI in about 50 ms rather than within a polling
interval. Writes still go over REST; the resulting change comes back on the stream like any
other, which is what makes the app correct when something else changes the receiver.

Writes are optimistic: the change shows immediately, the next snapshot replaces it, and a
failed write puts the previous value back.

**Two things about the stream are load-bearing:**

- **We do our own reconnection.** `EventSource` abandons a stream *permanently* when it
  receives a non-200 — exactly what a proxy returns while the service behind it restarts.
  Relying on its built-in retry leaves the page dead until someone reloads it. Ours retries
  with backoff and recovers in about half a second.
- **A watchdog, fed by the server's `ping` every 10 s.** A proxy can keep the connection
  open after the service dies, so the stream just goes quiet and no error ever fires.
  Twenty-five seconds of silence counts as offline and triggers a reconnect.

**Device state lives in `App.tsx`, not in the cards**, so it survives switching sections. A
hook inside `VolumeCard` would be unmounted on every tab change and the card would flash
"connecting" each time you came back to it.

Each section has **one controller hook** beside `useReceiver` — `useVolume`, `useInputs`,
`useProfiles`, `useTvTargets`, `useDisplay`. They all take the `ReceiverController` and
return the state plus the writes for their section, and `App.tsx` calls them once each and
passes the result to the card. That is where a section's own quirks live: dropping the
signal format when the input changes, hiding the unnamed profile slots, volume's
coalescing. The cards themselves hold no device state at all.

The power button reads the receiver's real state (polled every 4 s, slower than volume
since power rarely changes) and writes `PUT /api/power`. It is optimistic — the button lights
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

- Every card is the same height (`--card-height`, set deliberately above the natural height
  of the tallest one so none sits on the boundary), so swapping sections never resizes the
  surface under your thumb. A card at exactly its natural height grows past the token as
  soon as its content renders a fraction taller, and moves the toolbar with it.
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
navigations feel like one idea. It lives in `components/shared/PillList.tsx` and is shared with the
speaker-profile picker.

The header shows the format of the signal actually arriving (`Dolby D+`, `2.0 PCM`,
`No Signal`), and when something *is* playing three small bars animate on the selected row.
They are hidden entirely when there is no signal — as a static trio they read as an
ellipsis rather than as an indicator.

## The player

A strip below the card, visible whenever the streamer has something loaded and gone when it
does not — with the same gap to the card as the toolbar has above it. Artwork, track,
artist, elapsed and total time, a progress line, and previous / play-pause / next. It
expands into a full player; see below.

The position **counts locally and re-syncs on every update**. The streamer's status only
changes when something actually happens, so it does not report each passing second; a
long-poll can sit for a minute with the track advancing quietly behind it.

Artwork is loaded from whatever URL the streamer gives (a service CDN, or the Node itself
for local files), and falls back to a muted glyph if the image fails.

**It stays put across a skip.** Between tracks the streamer reports `connecting` and, for a
moment, nothing at all — so the player used to blink out and back on every skip, replaying
its entrance. Two things prevent that: `connecting` is treated as a track change rather than
a stop, and `hooks/useSustained.ts` holds the last track for a few seconds when the streamer
goes quiet.

### Expanding it

Tapping the strip grows it into the card slot: the same size, the same corner radius
and the same shadow as a section card, showing large artwork, the album, a scrub bar, bigger
transport and the receiver's volume. It **only ever opens because you asked it to** — never
on a track change, never on play.

Three things close it, and the last two also do what you asked in the same tap: the grab
bar, a section tab, or the device switcher.

**Neither control is a chevron, and neither is a bare `div`.** The strip's surface is an
invisible `<button>` under the layout — a sibling of the transport buttons, never their
parent — and the grab bar is a `<button>` styled as the pill, which starts the drag on
`pointerdown` and also collapses on click or Enter. Both keep the names the e2e specs drive
them by, "Expand player" and "Collapse player". Dragging is a pointer gesture with no
keyboard equivalent, so the bar has to be operable on its own; a click at the end of a real
drag is ignored, which is what `Morph.dragged()` is for.

**It is one element that changes shape, not two that cross-fade.** `hooks/usePlayerMorph.ts`
measures the two slots — the card's `tabpanel` and an empty placeholder div where the strip
sits — and writes the interpolated `top/left/width/height` onto the player as an inline
style, which `Player.module.css` transitions. The artwork is a single element in both
layouts for the same reason: it is what the eye follows, and two covers cross-fading at
different sizes read as a dissolve rather than as one growing.

Things worth knowing if you change this:

- **The placeholder div is load-bearing.** The player is absolutely positioned over the
  shell so it can travel; the placeholder is what keeps the space below the card reserved,
  so nothing reflows when it leaves.
- **A view transition would have been much less code and cannot be used here.** It plays
  start to finish on its own, and dragging down to close needs the morph to be scrubbable —
  the drag writes the same geometry the transition would have, frame by frame, with easing
  switched off.
- Only one layout is in the DOM at rest. Mid-morph both are, and the one on its way out is
  `inert` — otherwise there would briefly be two "Pause" buttons, and any query for the
  track title would be ambiguous.
- The mini layout is placed *from the artwork* (`padding-left` off `--art-size`), so the two
  layouts cannot drift apart as the cover grows.

### Scrubbing and volume

The scrub bar and the volume slider are real `<input type="range">` elements — dragging,
keyboard and assistive technology all work without reimplementing any of it, and only the
paint is ours. The filled portion is a gradient driven by a `--filled` custom property, since
a range input has nowhere to hang a second element.

**Seeking is committed on release, not on every value.** The position the finger is holding
wins over the local counter until then, and the counter stops so the two are not fighting.
Whether it is offered at all comes from the streamer's own `canSeek`, which is per track and
false for live radio — a better test than "does it have a length".

**The volume slider goes through the same coalescing as the buttons**, for a different
reason: a drag produces a value per frame and only the last one matters. `useVolume` holds
the most recent target while a request is in flight and sends only that one when the wire
clears; both kinds of write share one in-flight slot, so a drag and a button press can never
be on the wire at once. This is not optional — the receiver silently drops commands that
arrive too fast.

## The artwork backdrop

While something is playing, the whole viewport takes its colour from the album art: the
cover, blown up and blurred past recognition, behind the cards. It is a mood, not a picture
— CarPlay's now-playing background is the reference. With nothing playing, no cover, or a
cover that fails to load, it cross-fades back to the plain canvas and the app looks exactly
as it did before.

`components/shared/Backdrop.tsx`, one fixed element behind everything and a `tinted` class
on the shell. No other component knows it exists.

Four things about it are deliberate:

- **It is blurred small and then scaled up, not blurred at full size.** Filters apply
  before transforms, so blurring a `20vmax` box and scaling it 7.5× costs a fraction of a
  120px blur across the viewport and looks the same. It also fixes the edges: a blur samples
  nothing outside its own element, so an image at viewport size fades to transparent at the
  border and the corners go flat.
- **Two layers, not one `src` swap**, or a track change would cut instead of fading. The
  outgoing cover stays mounted underneath while the incoming one fades in, and a layer only
  fades in once it has actually decoded — otherwise the transition starts against nothing.
- **Nothing samples the image.** The art comes from a service CDN or the Node, so a canvas
  read would be cross-origin tainted. A blur needs no such access, and keeping the cover's
  own gradients is what makes it read as organic rather than as a flat wash.
- **There is always something behind the UI.** Every surface is glass, and glass with
  nothing behind it is a dark rectangle — so under the artwork sits a static gradient with a
  dusting of noise, and when the music stops the cover fades away to reveal *that* rather
  than the flat canvas. The noise is there because a wide, low-contrast gradient bands
  visibly once the vignette is over it.
- **The surfaces stop assuming a known ground.** `--shadow-card` and `--shadow-strip` are
  swapped by `.tinted` for a tighter shadow plus a close contact shadow, so a pane still has
  an edge against a pale cover. That is why the shadows in the app are tokens rather than
  literals. The hairline of light that used to live in `.tinted` belongs to the glass edge
  now, and is always on.

A flat scrim at 34% and a vignette hold the whole thing down near the canvas colour. That is
what keeps a garish cover from taking over, and what keeps light labels on the glass legible
over a very pale cover — the dimmest text in the app measures 4.9:1 against the brightest
cover. It is lighter than it was for the opaque cards: glass takes a second bite out of
whatever is behind it, and scrimming as hard as before left the panes looking like flat dark
plastic with nothing to refract.

## TV

Under the TV device, `Inputs` is the set's own sources. Four pills — HDMI 1, PlayStation, YouTube, Netflix — switching the LG set's input or
launching an app. The selection is not assumed: the API subscribes to what the TV reports
as its foreground app, so the highlight follows the set even when you change it with its own
remote, and shows nothing when it is on something outside this list.

With the TV off the card says "Off" and disables, because a set that is off cannot be woken
over the network.

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

## Sound

Three trims — **Bass**, **Treble** and **Subwoofer** — each in its own panel with its
current level above the slider. Anthem's own app offers the rest of the channel levels
too (Front, Front Wide, Center, and so on); these three are the ones that get touched.

The range is **−10.0 to +10.0 dB in 0.5 dB steps**, and it comes from the API rather than
being written down here — the receiver's limits belong to the receiver.

**The fill runs from the centre out to the thumb**, not from the left. A trim is an offset
from flat, so at 0.0 dB there is nothing filled, which is the honest picture. The reading
carries its sign and uses tabular figures, so it does not shuffle sideways during a drag.

**A drag is coalesced, like volume.** `hooks/useSound.ts` keeps only the *latest* value per
control and shares one in-flight slot across all three, so a drag that produces a value per
frame reaches the receiver as a handful of writes ending on the value you let go at. Without
that the receiver would silently drop most of them — it drops commands that arrive
back-to-back, which is also why the API paces its writes.

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
- The dial follows the physical remote as it moves, since the receiver pushes every change.
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
be scoped: the design tokens (the glass scale, the label ramp, `--card-height`, …) with the
reset, and the two card-entrance keyframes — the *direction* is chosen by the app shell but applied to the
card, and it travels as `--card-enter`, which CSS Modules leaves alone inside `var()`.

### Materials

The surface language is one small scale of tokens and nothing else. Three material tiers —
`--glass-thin`, `--glass-regular`, `--glass-thick` — each a background colour plus the
`--blur-*` recipe that belongs with it, mirroring iOS's tiers: thin for chrome that should
barely veil the art, regular for controls, thick for the largest pane on screen. Alongside
them a label ramp (`--label`, `--label-2`, `--label-3`), the edge shadows (`--edge`,
`--edge-soft`, `--sheen`), and iOS's fill ramp (`--fill`, `--fill-2`, `--thumb`) for
the things cut *into* glass rather than laid on it.

Three rules keep it coherent:

- **No component invents its own blur.** Pick a tier, use both halves of it.
- **Never glass on glass.** A pane sits on the backdrop, never on another pane. Anything
  inside a pane — the settings groove, the step and power buttons, the sliding thumbs — gets
  the *look* of glass from a translucent fill and a specular edge, but no `backdrop-filter`
  of its own: the pane underneath has already blurred what is behind, so a second pass would
  buy nothing and cost frames on the Pi.
- **Edges do the work, not shadows.** A bright hairline along the top, a darker one along
  the bottom and a faint ring all round are what make a pane read as glass against a cover of
  any lightness. The drop shadows are only there to lift it off the backdrop.

Deliberately frosted, not liquid: blur and saturation only, no refraction and no per-frame
gloss, because this has to stay smooth on a Raspberry Pi.

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
src/hooks/useReceiver.ts       the event stream: snapshots, reconnection, optimistic writes
src/hooks/useVolume.ts         volume level and press coalescing
src/hooks/useInputs.ts         the receiver's sources, and switching between them
src/hooks/useProfiles.ts       speaker profiles, minus the unnamed factory slots
src/hooks/useTvTargets.ts      the TV's own sources
src/hooks/useDisplay.ts        front panel displayed info
src/hooks/useSound.ts          bass, treble and subwoofer trim, and drag coalescing
src/hooks/usePlayerMorph.ts    the player's geometry between the strip and the card slot
src/components/shared/         Card, Panel, Toolbar, DeviceSwitcher, PowerButton, PillList, …
src/components/pages/          one card per device section
src/styles/global.css          tokens, reset, shared keyframes
public/                        icons and the web manifest, copied to the root of dist/
scripts/render-icons.py        rasterises the PNG icons from public/icon.svg
```

No web font is loaded: the system stack renders as SF Pro on iOS, which is what the
reference approximates, and nothing breaks when the phone is offline.
