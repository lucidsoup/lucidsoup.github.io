# Making rooms

The gallery is `gallery.html`, and everything in it comes from `rooms.json`.
Adding a room is one entry. Adding art to a wall is one string. There is no
HTML to touch.

## Add a room

```json
"my-room": {
  "name": "Whatever It Is Called",
  "note": "One optional line, shown on arrival.",
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

## Getting in

The centre of the box on the home page, once the box is open. It does not
exist before that — not in the nav, not in the tab order.
