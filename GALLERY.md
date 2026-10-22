# Making rooms

The gallery is `gallery.html`, and everything in it comes from `rooms.json`.
Adding a room is one entry. Adding art to a wall is one string. There is no
HTML to touch.

## Add a room

```json
"my-room": {
  "name": "Whatever It Is Called",
  "size": [5, 3.2, 5],
  "surfaces": {
    "floor":   { "art": "pattern:hex", "repeat": 4 },
    "ceiling": { "art": "pattern:moire", "repeat": 2 },
    "north":   { "art": "work:my-piece", "frame": true },
    "east":    { "exit": "somewhere-else", "label": "onward", "ascend": 1 },
    "west":    { "art": "image:videos/posters/thing.jpg" }
  }
}
```

`size` is `[width, height, depth]` in metres-ish. `[4, 3, 4]` is an ordinary
room, `[7, 3, 4.5]` a hall, `[3.4, 5.5, 3.4]` a shaft.

## Corridors and turning

A corridor is just a room with a long, narrow `size` — around `[2.2, 2.9, 10]`.
The eye sits further into a deep room, or a corridor reads as a wall with a hole
in it rather than something you are inside, and travelling into one takes longer.

An exit may carry **`turn`**: the degrees you are facing when you arrive.

```json
"east": { "exit": "crook", "label": "on", "turn": 30 }
```

Without it every room is entered square-on and a sequence reads as a slideshow.
With it a doorway is a corner, and keeping track of where you are becomes the
work. Clamped to the same limits as looking around.

**The space carries names and nothing else.** No descriptions, no subtitles on
the plinths, and nothing marks a dead end as a dead end. The hint says its piece
once and then stays gone.

## The one geometry rule

**`south` is behind you and is never drawn.** Put art on `floor`, `ceiling`,
`north`, `east` and `west`. A `south` exit still works — every exit is also a
button along the bottom of the screen — but art there is wasted.

This is not a bug to route around. A CSS 3D plane that crosses the eye renders
degenerately, so the room is a five-sided diorama with you at its open front.
It is what keeps the perspective honest.

## Making it impossible

`ascend` is how many flights a doorway climbs. The HUD keeps the running total,
so a staircase that loops back on itself tells on itself:

```
antechamber --up(+1)--> stair-a --up(+1)--> stair-b
     stair-c <--up(+1)-- stair-b
     stair-d --up(+1)--> stair-a        <- back at the first, +4 flights up
```

After five climbs the HUD reads `altitude +5 flights` and `this room is below
you`. Nothing enforces consistency between rooms, because rooms do not share a
coordinate system. Use negative values to descend. The Well is a room whose
floor and ceiling both lead to itself.

## What goes on a surface

One string, in `art`:

| string | what it is |
|---|---|
| `work:<id>` | a work from `media.json` — its preview loop, or its poster |
| `shader:<id>` | a live WebGL shader from `shaders/manifest.json` |
| `shader:random` | a different one of yours on every visit |
| `image:<path>` | any image in the repo |
| `pattern:<name>` | a tessellation drawn in code |
| `color:<css>` | a flat colour |

`"frame": true` hangs it as a framed piece instead of covering the surface.
`"repeat": N` tiles it N times across (patterns only).

Built-in patterns: `hex`, `triangle`, `penrose`, `escher`, `moire`, `grid`.
They exist so a room looks deliberate before you have made anything.

## Art specs

**Framed pieces** render at about **5:3**, cropped to fill. Supply 3:2 or 16:9
and little is lost; supply a square and the top and bottom go. Around
1600×960 is plenty — it is never shown larger than about a third of the screen.

**Full-surface art** covers a whole wall and is cropped to the wall's shape,
which changes with room size. Keep anything important away from the edges.
Floors and ceilings are the most forgiving places for this.

**Tileable patterns** must be seamless and square. Drop them in as
`image:` on a surface with a `repeat`, or add them to `PATTERNS` in
`gallery.html` to generate them in code instead (no file, any scale, free).

**Video loops** come from `media.json`, so they already have previews and
posters from `scripts/make-previews.mjs`. Short and seamless beats long: a wall
loop is scenery. A framed work with a `full` URL or path opens full-size when
clicked.

**Shaders** come from `shaders/manifest.json` — GLSL ES 1.0, Shadertoy-style
`mainImage`, same as the library. `scripts/shader-validate.mjs` checks them, and
now also checks that `index.html` and `gallery.html` still wrap them the same
way.

## Cost

Rooms are free — measured at 61fps against a 61fps ceiling. Only **live
shaders** cost anything, so the gallery runs at most three at once on a desktop
and one on a phone, and tears the contexts down when you leave a room. Use
`shader:` freely; the budget handles it.

Everything degrades: a missing work, shader or image leaves an empty frame and
the gallery carries on.

## The endless half

Past the authored rooms the gallery does not run out. A room id like `f012` is
an **address**: each digit picks one of the contractive maps in
`rooms.json` → `fractal.maps`, and the digits walk deeper into their attractor.

The room's size, colour, patterns and name all come from the orbit at that
point. Two consequences:

- **Deterministic.** An address is always the same room, so it can be linked to.
- **Self-similar.** Addresses sharing a prefix land near each other. Measured:
  siblings **0.118** apart, cousins **0.446**, strangers **0.753** — properly
  nested, so a room genuinely resembles its parent. Descending is zooming.

Edit `fractal.maps` and the whole endless half changes. Three maps means three
ways deeper from every room; `branch` can be 2 to 4.

Authored rooms and generated rooms mix freely — a generated room can name an
authored one as an exit and the other way round. `reliquary` is the seam.

## Stairs

A room may carry a `stairs` array. Each entry draws a real flight of treads and
risers inside the room, and clicking it travels:

```json
"stairs": [
  { "to": "stair-b", "label": "up", "ascend": 1, "steps": 10,
    "facing": "north", "gravity": "down", "width": 0.46,
    "offset": -0.22, "from": 0.05 }
]
```

| field | what it does |
|---|---|
| `to` | room id it climbs to |
| `label` | text at the top of the flight |
| `ascend` | flights gained, same as a doorway |
| `steps` | how many, 2–24 (default 9) |
| `facing` | `north` / `east` / `west` / `south` — which way it climbs |
| `gravity` | `down` / `right` / `up` / `left` — **which way is down for this flight** |
| `width` | fraction of room width (default 0.42) |
| `offset` | sideways shift, in the flight's own gravity frame |
| `from` | how far back it begins, 0–1 of room depth |

**`gravity` is the Escher part.** Four flights at four gravities in one room is
Relativity — each is tinted a different colour so the eye reads them as separate
worlds rather than as a mistake. `offset` is applied *after* the gravity
rotation, so each flight shifts along its own idea of sideways and the four fan
out around the room instead of piling through its centre.

Climbing a flight animates as a climb — the room drops away beneath you — rather
than the fade-cut a doorway uses. A staircase that loops is then something you
feel, not just a number in the corner.

Every flight is also a `↗` button in the HUD, so stairs are reachable without
hitting a 3D target.

The generated half uses stairs too: each branch deeper is a flight, and a room
inside the set gets flights that disagree about which way is down.

## Altering a room

Manipulation is a state you **carry**, not a panel you open. It persists as you
travel, so exploring and altering are the same activity: you take your version
of the place deeper with you. Every verb is one CSS filter or transform, which
is why they all compose and why it is free — measured at 61fps with four echoes,
a hue rotation and a twist running, against a 61fps ceiling.

| verb | key | what it does |
|---|---|---|
| echo | `E` | nests copies of the room behind itself — the room containing the room |
| fold | `F` | mirrors the space onto itself |
| twist | `T` | rotates the room out of true |
| down | `G` | rotates which way is down — a flight you could not use becomes the one underfoot |
| hue | `H` | rotates all colour |
| sat | `S` | drains or floods saturation |
| hard | `C` | contrast |
| flip | `I` | inverts |
| haze | `B` | blur |

Hold **shift** to step a verb backwards, `X` to go back to plain. Every verb is
also a button, so none of this needs a keyboard.

**Clicking a wall changes what is on it** — it cycles through the six patterns,
then a live shader, then one of your works. On a generated room the change
sticks while you are away and come back, because the room is cached as you left
it.

The address bar carries both where you are and what you have done to it:

```
gallery.html#r=f012&echo=2&hue=120&twist=14
```

So a room in a particular state is a link. That is the sharing mechanism — no
server, no save button.

### The one thing to know if you extend this

A CSS `filter` on an element **between** `#camera` and `#room` makes it a
grouping element and **flattens `preserve-3d`** — the room collapses to a single
plane. The filter therefore goes on `#stage`, outside the 3D chain. The style
looks correct either way; only the picture tells you. Echo copies have their
media and doorways stripped, so they stay cheap and never steal a click.

## The short way round

Not everyone wants to walk a labyrinth to reach the SP-404 converter. The
shortcut is **The Concordance** — a hall one step up from the entrance whose
doors are each named for where they go and lead straight there. It keeps the
short route inside the architecture instead of floating a menu over it, so the
labyrinth stays the default without becoming a toll.

A surface can carry several doors to make a hall like that:

```json
"north": {
  "art": "mural:ornament",
  "doors": [
    { "exit": "reliquary", "label": "shaders",  "at": 0.14, "tall": true },
    { "exit": "workshop",  "label": "drumseek", "at": 0.38, "tall": true }
  ]
}
```

`at` places a door along the wall from 0 to 1; without it they share the wall
evenly. `tall` makes an arch rather than a low door. A door to a room that does
not exist is never drawn.

Everything in the site is two rooms from the entrance this way, and three to six
if you wander instead.

## The Stack

`stack.css` + `stack.js`. Every page the site has, on one tower of lit panels
hanging in a void, which you turn and descend through. Open it from the nav, from the
`≡ index` chip in the gallery's HUD, from the `index` button beside the way
back on every other page, or with `` ` `` or `/` anywhere.

The reference is the flythrough in *Hackers* (1995): orbiting translucent
plates, wireframe boxes where nothing has resolved, a ruled floor, and a frame
of readouts around all of it. It exists because the gallery being the only
index made some pages four rooms deep, and because a dropdown would have been
a second, duller way in beside the architecture rather than part of it.

Tiers, top to bottom:

| tier | what is on it |
|---|---|
| Surface | the bowl, the gallery |
| Works | portfolio, shader library |
| Instruments | DrumSeek, SP-404 converter, SynthSoup, BlackboxFX, and the two live ones |
| Trade | shop, about, contact |
| Chambers | the rooms that hold something |
| Flights | the stairs, the well, relativity |
| Corridors | the long way round |
| Descent | fractal addresses, which do not run out |

The fixed half is a list in `stack.js`; **a new page has to be added to it** or
it is not on the index. The architecture half is read from `rooms.json` at
runtime and sorts itself, so a new room needs nothing. If `rooms.json` will not
load the tower simply stops after Trade.

Arrows turn the ring and change the tier, `↵` goes, `esc` closes; drag and
the wheel do the same; every plate is also a real button, so tab and enter work
and `prefers-reduced-motion` lays the whole thing out flat as a grid.

Four things in it are load-bearing and easy to undo by accident:

- **`#lucid-stack-cam` must stay `pointer-events: none`.** Hit testing inside a
  `preserve-3d` context sorts by z, and that element's own box sits at z=0 —
  nearer the eye than every plate. Left interactive it silently swallows every
  click on the tower.
- **Nothing between the perspective and the plates may carry a `filter`, a
  `mask`, a `backdrop-filter` or an `opacity` below 1.** Any of them makes that
  element a grouping element, which flattens the 3D into one plane. Dimming is
  done on the leaves, and the grid's distance fade is painted into its own
  background rather than masked.
- **`--ls-ring` must stay below `--ls-dist`**, or a plate swings behind the eye
  and renders degenerately. The same goes for the grid planes, which is why
  they are pushed back past their own half-width.
- **The page behind it stands down.** The overlay is opaque, so `stack.js`
  fires `lucid:stack` and the gallery stops rendering its room, the entrance
  stops its canvas. The keyboard is captured on the window for the same reason:
  the gallery turns the room on the arrows and SynthSoup plays notes on them.

## The bowl is the front door

`soup.css` + `soup.js`. The front page is a bowl of soup with every page of the
site floating in it, in plain sight, and clicking a piece goes under: the broth
rushes up, the screen fills, and the page surfaces inside the same liquid.

This replaced the box, and the box had replaced a scrolling page. The box asked
you to open it before it would say what was inside, and what was inside was the
labyrinth, which asked for patience again before it would hand over a drum
machine. That is a great deal to ask of somebody who arrived to look at some
visuals. A bowl asks for nothing.

**The pieces go round.** Three rings turn at three speeds, inner fastest, which
is how liquid in a round vessel moves and what the broth shader underneath is
already doing. `RINGS` holds the radii and periods; a full turn of the outer
ring takes nearly three minutes, so a piece drifts about 11px a second and is
easy to catch.

**Adding a page means adding a piece**, in the `BITS` list in `soup.js`:

```js
{ id: 'thing', label: 'Thing', sub: 'what it is',
  hash: 'thing',            // a section on this page …
  href: 'thing/',           // … or another page; one or the other
  shape: 'pea', d: 70, ring: 1, a: .25 }
```

`ring` picks the orbit and `a` is where on it the piece starts, in turns from 0
to 1. Space the `a` values on a ring evenly or same-ring pieces will travel
locked together. A ring radius has to stay under `.5` or the orbit leaves the
bowl; `.46` is about the limit before a large piece starts clipping the rim.
`d` is the piece's diameter at the bowl's full width, converted to `cqw` so the
whole arrangement scales with the bowl instead of piling up on a small window.

There is a test that sweeps a whole cycle — 720 phases — and checks that no
piece leaves the ellipse, that same-ring pieces never collide, how often
different rings pass (about one pair at a time, which is what a bowl does), and
that every piece resolves to something real.

Four things worth knowing:

- **The system's motion preference is the default, not the verdict.** A machine
  asking for reduced motion gets a bowl that holds still, which is right — and
  a bowl that can never be made to turn is a worse answer than one that asks.
  The spoon under the bowl flips it either way and the choice is remembered in
  `localStorage` under `lucid.stir`. The stylesheet keys off `lucid-still` on
  `<html>` rather than the media query directly, with `lucid-stirred` marking
  "the viewer overruled their system", which is what lets the media query stand
  down. Turning motion back on has to restart the broth, the live pieces and
  the orbits by hand: they are all started lazily, so flipping the flag alone
  leaves a bowl that is allowed to move and isn't.
- **Pointing at a piece stops the whole bowl**, like putting a spoon in, and
  letting go starts it again. Stopping only the piece under the pointer would
  tear it out of its orbit; stopping nothing would leave every target moving,
  which is the fastest way to make a playful thing annoying.
  **A piece arriving at a parked pointer does not count**, and that distinction
  is load-bearing: stopping on any `mouseenter` deadlocked every desktop. A
  pointer left anywhere over the bowl eventually has a piece orbit into it, the
  bowl stops, and that piece is now parked under the pointer forever, because
  `mouseleave` can never fire. Phones have no hover, so the bowl kept turning
  there and only there. An enter counts only if the pointer moved in the last
  1.5 seconds; a `mousemove` on the piece counts too, which covers waking a
  parked pointer without leaving the piece it is sitting on.
- **Depth does the work when two pieces pass.** The bowl is squashed hard by
  the perspective, so pieces crossing are only tens of pixels apart vertically;
  size and opacity both run with `y` so one visibly slides under the other
  instead of colliding with it.
- **Labels ride above their piece, on a pill.** Below, a label sat exactly
  where the next piece round was coming up to cover it, and a third of them
  were hidden at any moment; above, the only things near a label are further
  back, so its own z-index draws it over them. The pill is what makes a name
  crossing another piece's face read as a label rather than a collision. Near
  the top of an orbit it flips underneath so it does not hang over the rim.
- **What rides the orbit is the disc, not the button.** The button's box is the
  label stacked on the piece, so centring the box put the piece half a label
  below its orbit and carried the outer ring over the rim at the bottom.
- **The landing needs its own scrim.** The visual engine's sliders write
  `opacity` and `mix-blend-mode` onto `#visual-canvas` as inline style, which no
  stylesheet can outrank, and `screen` is bright enough to swallow body text.
  So the canvas is left alone and `body.focused::before` sits over it, under the
  content: canvas at z-index 0, scrim at 1, page at 2.
- **Without scripting it is a list.** The eleven links are in the HTML already
  and `soup.js` builds over them, so a visitor with no JS gets a plain index of
  everywhere rather than an empty bowl.

## One section at a time

`index.html` is not a page you scroll. It shows the bowl, or exactly one
section, routed by the hash. The nav carries two items and neither is a
category: the way back up to the bowl, and the Stack.

**A new section has to be added to `SECTION_IDS`** or the router never hides it
and it shows permanently, under the bowl and beside every other section. That
is exactly what happened when the BlackboxFX section landed.

A room says what it holds with `opens`:

```json
"opens": { "href": "index.html#shop", "title": "Shop", "note": "prints and editions" }
```

or several, when one room holds more than one thing:

```json
"opens": [
  { "href": "index.html#about",   "title": "About",   "note": "what this practice is" },
  { "href": "index.html#contact", "title": "Contact", "note": "how to reach it" }
]
```

That draws a plinth in the room, and a `▣` button in the HUD beside the exits.
Clicking either leaves the gallery for that section, which then shows alone with
a way back.

A room can still say what it holds, and still should — it is what makes the
rooms feel occupied rather than decorative. It is no longer the only way in,
so a section with no room is reachable from the bowl like everything else.
Current wiring:

| section | room |
|---|---|
| Portfolio | Antechamber |
| Shader Library | Reliquary |
| DrumSeek | Workshop |
| SP-404 Converter | The Bench |
| About, Contact | Studio |
| Shop | Counting House |

The gallery is one of the pieces in the bowl, labelled *the long way*. It is a
place to go now, not a gate to pass.

## The shared layer

`lucid.css` and `lucid.js` are the only things every page loads. The site had
grown four separate design languages — the entrance and the SP-404 tool on
Orbitron and cyan, the gallery on Courier with its own black, DrumSeek on red
and yellow, SynthSoup on pink, lime and Shrikhand — so cyan was three slightly
different cyans and no page but the entrance linked back to the gallery.

`lucid.css` holds the palette, the type and the way back, and nothing else.
Every token is prefixed `--lucid-` because SynthSoup already defines
`--display`, and overwriting that would break it. Each use carries its original
value as a fallback (`var(--lucid-cyan, #00ffff)`), so a page still looks right
if the stylesheet fails to load.

`stack.js` loads next to it on every page and injects the `index` button beside
that return link, wrapping both in `.lucid-chrome`.

`lucid.js` injects the return link. It skips three cases: inside an iframe
(DrumSeek is embedded in a section and would otherwise show the bar inside the
frame), a page carrying `data-lucid-no-return` (the entrance and the gallery
have their own), and the gallery itself.

**SynthSoup keeps its own interior on purpose.** It is a separate instrument
with a deliberate identity, and repainting it cyan would destroy something that
works. Cohesion there means shared chrome, not a shared skin.

## Getting in

The spiral in the bowl, labelled *the long way*. Also on the Stack, under
Surface. It used to be the only door in the building; it is a door now.
