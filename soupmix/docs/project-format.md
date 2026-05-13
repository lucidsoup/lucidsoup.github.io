# Project file format

A soupmix project is a directory. The directory contains a manifest
(`project.json`) plus one file per subsystem so version control diffs
remain readable.

```
my_show/
├── project.json     # manifest: name, version, scene list, projector list
├── graph.json       # node graph: nodes, links, parameters
├── scenes.json      # scenes (snapshots) and clips (transitions between scenes)
├── mapping.json     # surfaces, blend masks, projector calibration
├── midi.json        # MIDI / OSC bindings
└── assets/          # local copies of images, videos referenced by the project
    └── ...
```

Files are JSON with `nlohmann::json`. UUIDs (RFC 4122 v4) identify
every object so references across files survive renames. Floats are
written with full precision; integers as integers.

## `project.json` (manifest)

```json
{
  "soupmix_version": "0.1.0",
  "project_version": 1,
  "uuid": "ce0d2c1b-d2dd-4f8f-8e64-22b6f7d27e2a",
  "name": "hello-fractal",
  "created": "2026-05-13T10:00:00Z",
  "modified": "2026-05-13T11:42:00Z",
  "default_scene": "ac1f-...",
  "projectors": ["d9e1-...", "d9e2-..."]
}
```

`soupmix_version` records the engine version the file was last written
by. `project_version` is bumped only when the on-disk schema changes in
an incompatible way; see [Migrations](#migrations).

## `graph.json`

```json
{
  "nodes": [
    {
      "uuid": "...",
      "kind": "mandelbrot",
      "version": 1,
      "label": "Mandelbrot",
      "position": [120, 80],
      "parameters": {
        "zoom":   { "value": 1.5 },
        "center": { "value": [-0.7, 0.0] },
        "iter":   { "value": 256 },
        "palette":{ "value": "viridis" }
      },
      "bindings": {
        "zoom":   { "midi": { "channel": 0, "cc": 21 } }
      }
    }
  ],
  "links": [
    {
      "from": { "node": "<uuid>", "pin": "out_tex" },
      "to":   { "node": "<uuid>", "pin": "in_tex"  }
    }
  ]
}
```

Parameter `value` is whatever JSON type the parameter declares
(`float`, `[r,g,b]`, string, ...). Unknown parameters are preserved on
load and re-emitted on save, so plugins added in a newer build don't
get dropped by an older one.

## `scenes.json`

A scene is a named snapshot of every parameter on every node, plus the
current state of layers / output assignments. Clips trigger scene
transitions over a duration with an easing curve.

```json
{
  "scenes": [
    {
      "uuid": "...",
      "name": "Intro",
      "snapshot": { "<node_uuid>": { "<param>": <value>, ... } }
    }
  ],
  "clips": [
    {
      "uuid": "...",
      "name": "Intro → Drop",
      "from": "<scene_uuid>",
      "to":   "<scene_uuid>",
      "duration_ms": 4000,
      "easing": "in_out_cubic"
    }
  ]
}
```

## `mapping.json`

```json
{
  "surfaces": [
    {
      "uuid": "...",
      "kind": "quad",
      "name": "Front wall",
      "corners":     [[100,100],[1820,100],[1820,980],[100,980]],
      "content_uv":  [[0,0],[1,0],[1,1],[0,1]]
    }
  ],
  "blend_masks": [
    {
      "uuid": "...",
      "polygon": [[1700,100],[1820,100],[1820,980],[1700,980]],
      "feather_px": 60,
      "gamma": 2.2,
      "black_level": 0.05
    }
  ],
  "projectors": [
    {
      "uuid": "...",
      "name": "Projector A",
      "window": { "monitor": 1, "x": 0, "y": 0, "w": 1920, "h": 1080 },
      "viewport": { "x": 0, "y": 0, "w": 1920, "h": 1080 },
      "layout": {
        "surfaces":   ["<surface_uuid>"],
        "blend_masks":["<blend_mask_uuid>"]
      },
      "source": "<output_node_uuid>"
    }
  ]
}
```

## `midi.json`

```json
{
  "devices": [
    { "name": "Launch Control XL", "input": true, "output": true }
  ],
  "bindings": [
    {
      "midi":   { "channel": 0, "cc": 21 },
      "target": { "node": "<uuid>", "parameter": "zoom" },
      "scale":  { "min": 0.5, "max": 4.0, "curve": "exp2" }
    }
  ],
  "osc": [
    {
      "address": "/soupmix/zoom",
      "target":  { "node": "<uuid>", "parameter": "zoom" },
      "scale":   { "min": 0.5, "max": 4.0, "curve": "linear" }
    }
  ]
}
```

## Migrations

When the schema changes:

1. Bump `project_version` in the loader's `kCurrentProjectVersion`.
2. Add a migration function `migrate_v<N>_to_v<N+1>(json& doc)` in
   `src/project/migrations/`.
3. The loader runs migrations in sequence until the document reaches the
   current version.
4. Saving always writes the current version. There is no "save as old
   version".

## Determinism

Two projects with identical content must serialize byte-for-byte
identically. The saver sorts object keys, normalizes float formatting,
and emits LF line endings regardless of host OS. This makes git diffs
useful and lets us regression-test by hashing project files.
