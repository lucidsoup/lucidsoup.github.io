# soupmix architecture

This document is the top-level map of the codebase. It explains what each
subsystem owns, how they fit together at runtime, and the rules that keep
the rendering loop deterministic and fast.

## Goals

1. **Live performance**: 60 Hz output (90/120 Hz where possible) with bounded
   per-frame work and no GC-style pauses. Allocation outside startup is
   restricted to short-lived staging buffers.
2. **TouchDesigner-style composition**: every visual is a directed acyclic
   graph of typed nodes. Editing the graph is non-modal: changes are picked
   up the next frame.
3. **Resolume-style mixing**: scenes are snapshots of node parameters and
   layer states; clips trigger transitions between scenes.
4. **MadMapper-style mapping**: the same render graph can drive any number
   of output surfaces (quads, grids, NURBS, masks) with per-surface warping,
   soft-edge blending, and per-projector output windows.
5. **MIDI / OSC throughout**: every parameter is addressable; MIDI Learn
   binds controllers to parameters in seconds.

## Layer cake

```
                +-----------------------------+
                |        UI (ImGui)           |   editor, inspector, mapping
                +--------------+--------------+
                               |
                +--------------v--------------+
                |       Control plane         |   MIDI, OSC, audio clock,
                |   (control/, project/)      |   scenes, presets, macros
                +--------------+--------------+
                               |
                +--------------v--------------+
                |       Graph plane           |   nodes, parameters, links,
                |        (graph/, nodes/)     |   compiler, executor
                +--------------+--------------+
                               |
                +--------------v--------------+
                |      Render plane           |   render graph, GL passes,
                |     (render/, mapping/)     |   surfaces, projectors
                +--------------+--------------+
                               |
                +--------------v--------------+
                |     Platform / IO           |   window, input, filesystem,
                | (platform/, io/, debug/)    |   logging, video, recording
                +-----------------------------+
```

Direction of dependency runs top-to-bottom. The UI may read from the graph
plane to render its widgets but writes only through commands recorded by
the control plane. The graph plane never touches the UI; it produces a
`RenderGraph` consumed by the render plane.

## Frame loop

Each frame, `App::tick` runs the following in order on the main thread:

1. **Pump platform events** (`platform::Window::pollEvents`). Keyboard,
   mouse, drop, resize.
2. **Pump control inputs** (`control::MidiManager`, `control::OscServer`).
   These deposit `ParameterValue` updates into a lock-free SPSC queue,
   drained here.
3. **Apply timeline / audio clock** advances. Beat phase, BPM, frame time.
4. **Apply pending edits** to the live `Graph` (add/remove node, change
   parameter). Edits are batched into a single transaction that bumps the
   graph generation counter.
5. **Compile**, if dirty: `GraphCompiler` topologically sorts the graph,
   resolves pin types, computes framebuffer footprints, and emits a
   `RenderGraph`.
6. **Execute** the render graph: `GraphExecutor` runs each pass with the
   `Renderer`, producing one or more final textures.
7. **Map outputs**: each `Projector` consumes its assigned final texture
   plus its `OutputLayout` (surfaces, masks, blends) and emits one
   fullscreen-quad pass per output window.
8. **Editor pass**: ImGui collects widgets and submits its draw lists to a
   dedicated GL framebuffer or directly to the editor window.
9. **Present**: `glfwSwapBuffers` on each managed window.

Steps 5 and 6 are the hot path. Allocation here is forbidden; everything
runs out of pools owned by `Renderer` and `GraphExecutor`.

## Threading model

soupmix is "single-threaded with helpers": the render thread owns OpenGL
and the live graph. Helpers run on dedicated worker threads and
communicate via lock-free queues:

| Thread        | Owner                            | Communication                       |
|---------------|----------------------------------|-------------------------------------|
| `render`      | `App`, `Renderer`, `GraphExecutor` | —                                   |
| `midi`        | `MidiManager`                    | SPSC queue of `ParameterEvent`      |
| `osc`         | `OscServer`                      | SPSC queue of `ParameterEvent`      |
| `audio-clock` | `AudioClock`                     | atomics: bpm, phase, beat counter   |
| `io`          | `VideoDecoder`, `Recorder`       | producer/consumer texture upload    |

There is no global lock. The graph is mutated only on the render thread,
in response to drained command queues.

## Module map

| Directory             | Owns                                                 |
|-----------------------|------------------------------------------------------|
| `core/`               | App lifecycle, time, UUIDs, `Result`, service locator |
| `platform/`           | Window, input, filesystem, path resolution           |
| `render/`             | GL context, shaders, textures, FBOs, render graph    |
| `graph/`              | Nodes, pins, links, parameters, compiler, executor   |
| `nodes/`              | Concrete node implementations (sources, fx, ...)     |
| `mapping/`            | Surfaces, projectors, blend masks, output layout     |
| `control/`            | MIDI, OSC, audio clock, MIDI Learn, macros           |
| `project/`            | Project load/save, scenes, presets, asset registry   |
| `ui/`                 | ImGui editor: dockspace, graph editor, inspector, …  |
| `io/`                 | Image/video decode, screenshots, recording           |
| `debug/`              | Logging, profiler, GPU timers, assertions            |
| `app/`                | Editor and headless show apps, command-line parsing  |

## Build configuration

- **C++20**, `cxx_std_20` is required on `soupmix_core`.
- **OpenGL 4.5 core** via glad. SPIR-V is not used.
- **No exceptions across module boundaries.** Internal use is allowed but
  every public function returns `core::Result<T>` (a tagged-union value or
  error code) for recoverable failures. Programmer errors abort via
  `SOUPMIX_ASSERT`.
- **Warnings are errors** in CI (`-Wall -Wextra -Wpedantic` and friends;
  see `cmake/CompilerWarnings.cmake`).

## What this skeleton does today

Currently the engine starts up, opens a single window, clears it to a
solid color, and shuts down cleanly. Every subsystem listed above has a
header with the agreed interface and a stub `.cpp` body that compiles.
The order of implementation we recommend is:

1. `core/` + `platform/` (already minimally working)
2. `render/` (texture, shader, framebuffer, then `Renderer`)
3. `graph/` (Node/Pin/Link types, then `GraphCompiler`/`GraphExecutor`)
4. A handful of nodes in `nodes/sources/` and `nodes/output/`
5. `ui/` (dockspace, inspector, then graph editor)
6. `project/` (load/save round-trip)
7. `mapping/` (quad surface with bezier warp, then projectors)
8. `control/` (MIDI Learn, then OSC, then audio clock)
