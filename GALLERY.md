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

## The gallery is the only index

`index.html` is no longer a page you scroll. It shows the entrance, or exactly
one section, and only when the gallery has sent it there by name. The nav lists
no sections — just the way in and the way back.

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

**Keep exactly one room per section.** Nothing else links to them, so a section
with no room is unreachable. Current wiring:

| section | room |
|---|---|
| Portfolio | Antechamber |
| Shader Library | Reliquary |
| DrumSeek | Workshop |
| SP-404 Converter | The Bench |
| About, Contact | Studio |
| Shop | Counting House |

The box on the entrance dives into the gallery rather than scrolling — each flap
arrives at the room that holds that part of the site.

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

`lucid.js` injects the return link. It skips three cases: inside an iframe
(DrumSeek is embedded in a section and would otherwise show the bar inside the
frame), a page carrying `data-lucid-no-return` (the entrance and the gallery
have their own), and the gallery itself.

**SynthSoup keeps its own interior on purpose.** It is a separate instrument
with a deliberate identity, and repainting it cyan would destroy something that
works. Cohesion there means shared chrome, not a shared skin.

## Getting in

The centre of the box on the home page, once the box is open. It does not
exist before that — not in the nav, not in the tab order.
