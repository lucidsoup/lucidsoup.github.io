# Node specification

Every visual in soupmix is produced by a graph of nodes. This document
defines what a node is, what types flow between nodes, and how the
compiler turns the editable graph into an executable render graph.

## Node anatomy

A node is an instance of a `NodeKind` registered in `NodeRegistry` plus:

- a unique `UUID`,
- a human-readable label,
- zero or more **typed input pins**,
- zero or more **typed output pins**, and
- a `Parameter` map (named, typed runtime values exposed in the inspector
  and addressable from MIDI / OSC).

A node has no internal state that survives a frame, *except* through
explicit "feedback" pins which read from a designated framebuffer of the
previous frame. This keeps the graph a strict DAG within a single frame.

## Pin types

| Type        | Carries                                  | Notes                                  |
|-------------|------------------------------------------|----------------------------------------|
| `Texture`   | A `Texture` reference + sampler state    | The dominant pin type. RGBA8 / RGBA16F. |
| `Float`     | A scalar `float`                         | Knobs, modulators.                     |
| `Vec2`      | `glm::vec2`                              | UV offsets, sizes.                     |
| `Vec3`      | `glm::vec3`                              | RGB color, position.                   |
| `Vec4`      | `glm::vec4`                              | RGBA color, quaternion-like data.      |
| `Color`     | `glm::vec4` clamped to [0,1]             | Inspector renders a color picker.      |
| `Surface`   | A `mapping::Surface` reference           | Connects render graph to mapping.      |
| `Trigger`   | A bool that is true for exactly 1 frame  | Used for shot triggers, presets.       |
| `Beat`      | Phase ∈ [0,1) + integer beat counter     | Sourced from `AudioClock`.             |

Type coercion is explicit. The compiler rejects mismatched links rather
than inserting silent conversions; an explicit "convert" node bridges
types where needed (e.g. `Float → Vec3` via "vec3 splat").

## Parameter types

Parameters are inspector-editable values stored on a node. Each parameter
has:

- a `name` (machine-friendly, stable across versions),
- a `display_name`,
- a `value` (one of: `bool`, `int`, `float`, `Vec2`, `Vec3`, `Vec4`,
  `Color`, `String`, `Enum`, `Path`),
- a `range` (for numerics: min, max, default, soft-step), and
- an optional `binding` (MIDI CC / OSC address, see `control/MidiLearn`).

Parameters are saved/loaded as JSON. Renaming a parameter requires a
project-format version bump and a migration entry.

## Lifecycle

```
NodeRegistry::create(kind)
        |
        v
    Node::initialize(GraphContext&)
        |
        v
    [per frame, while in graph]
        Node::beforeFrame(FrameContext&)     // sample params, compute uniforms
        Node::recordPasses(RenderRecorder&)  // append GL passes to render graph
        Node::afterFrame(FrameContext&)      // optional feedback writes
        |
        v
    Node::shutdown(GraphContext&)
```

Nodes never call OpenGL directly. They append `DrawPass` records to a
`RenderRecorder`, which the `Renderer` plays back later. This is the rule
that lets us reorder, fuse, and time GPU work centrally.

## Registry and discovery

`NodeRegistry::registerKind<T>(NodeMeta meta)` is called once at startup
per concrete node type. `NodeMeta` carries the category (source, fx,
utility, output, mapping), display name, version, and a factory closure.

Built-in categories:

- **Sources**: `solid_color`, `checker`, `gradient`, `noise`, `mandelbrot`,
  `julia`, `sacred_geometry`, `image`, `video`, `webcam`.
- **FX**: `blur`, `feedback`, `kaleido`, `transform`, `levels`, `chroma`,
  `displace`, `mix`, `mask_apply`.
- **Utility**: `lfo`, `envelope`, `math`, `select`, `time`, `beat_divide`.
- **Output**: `to_layer`, `to_window`, `to_surface`.
- **Mapping**: `surface_quad`, `surface_grid`, `softedge`, `mask`,
  `projector`.

Every category has a matching header in `include/soupmix/nodes/` and a
sub-folder in `src/nodes/`.

## Compilation

`GraphCompiler::compile(const Graph&) -> RenderGraph`:

1. Validate that the graph is a DAG (no cycles other than declared
   `feedback` reads).
2. Resolve pin types end-to-end. Reject mismatches.
3. Topologically sort nodes.
4. For each node, ask it to record passes via a dry-run `RenderRecorder`
   that computes the texture footprint needed for its outputs.
5. Pack textures into a pool — reuse the same GPU memory for non-overlapping
   lifetimes.
6. Emit a flat `RenderGraph` (sequence of `DrawPass` records + resource
   handles) ready for `GraphExecutor::run`.

Compilation is cached. Editing only a parameter is a O(1) update; editing
topology recompiles, which currently takes ≪1 ms for graphs up to ~200
nodes.

## Authoring a new node (cookbook)

1. Add a header in `include/soupmix/nodes/<Category>Nodes.hpp` (or a new
   header for a new category).
2. Add the implementation in `src/nodes/<category>/`. Inherit from
   `graph::Node`. Implement `recordPasses` and any per-frame logic.
3. Register in the corresponding category registrar function called from
   `App::registerBuiltinNodes`.
4. Ship the shader(s) under `shaders/<category>/`.
5. Add a smoke test in `tests/graph/` that compiles a one-node graph.

## Versioning

Each node kind carries an integer `version`. Projects record the version
they were authored against. Loading a project with a newer node version
requires a migration step in `project/ProjectLoader`; the loader refuses
to silently drop or rewrite data.
