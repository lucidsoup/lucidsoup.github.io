# Projection mapping specification

## Concepts

- **Surface**: a region of texture space (the "content") mapped onto a
  region of output space (the "physical surface as the projector sees it").
  Surface kinds: `Quad`, `Grid` (NxM bezier mesh), `Mask`.
- **OutputLayout**: an arrangement of surfaces on a single virtual canvas.
  Multiple surfaces, ordered back-to-front, with blend masks and per-surface
  alpha.
- **Projector**: a binding between a physical output window (or a region
  of one) and an `OutputLayout`. Each projector is fed one final `Texture`
  by the render graph.
- **BlendMask**: a grayscale ramp painted over a polygon used to feather
  the edges of overlapping projectors (soft-edge blending).
- **Calibration**: corner / mesh handles plus optional homography fits,
  saved per projector.

## Coordinate spaces

```
content UV (0..1, 0..1)
        |  surface.contentMapping (affine + crop)
        v
surface texture space
        |  surface.warp  (quad: 4 corners; grid: bezier patches)
        v
projector canvas space (pixels, origin top-left)
        |  projector.viewport (x, y, w, h) within OS window
        v
OS window framebuffer space
```

## Surface kinds

### QuadSurface

Four-corner perspective warp. Implemented in `shaders/mapping/output_quad.vert`
using a 3x3 homography fitted from the four corner positions.

```json
{
  "kind": "quad",
  "corners": [[x0,y0], [x1,y1], [x2,y2], [x3,y3]],
  "content_uv":  [[0,0], [1,0], [1,1], [0,1]]
}
```

### GridSurface

NxM grid of cubic bezier patches. Resolution is authored once (default
8x8) and refined per project. Each interior vertex has independent
control handles. Used for cylinder wraps, dome segments, scrim wrinkles.

### Mask

A polygon (or stack of polygons, ordered) with per-vertex alpha and an
optional soft falloff in pixels. Masks can be additive or subtractive.

## Blend masks (soft-edge blending)

A `BlendMask` is a polygon with a feather radius and a gamma curve. The
mask is rendered into a single-channel framebuffer once per projector
when the layout changes; the cached mask is sampled during the final
output pass to multiply the content alpha.

The mapping inspector exposes:

- per-edge feather width (px),
- per-edge gamma (0.5–3.0, default 2.2 to approximate projector response),
- per-edge "black level" lift to fight projector black-bleed in overlaps.

## Calibration workflow

1. Open the Mapping view. The selected surface shows its handles.
2. Drag corners (or grid handles) until the test pattern lines up with the
   physical edges of the surface. Hold Shift to snap to integer pixels.
3. For multi-projector setups: switch to "blend" mode, paint blend
   polygons over the overlap regions, dial in feather and gamma.
4. Save the project. The calibration lives in `mapping.json` next to the
   project; see [`project-format.md`](project-format.md).

## Output pipeline

```
RenderGraph final textures
        |
        |  one Texture per Projector
        v
Projector::compose(texture)
        |
        |  for each Surface in z-order:
        |    sample texture with surface.contentMapping
        |    warp into projector canvas
        |    multiply by blend mask
        v
glViewport(projector.viewport)
glClear(...) ; render canvas as fullscreen quad
glfwSwapBuffers(projector.window)
```

A single `Renderer` owns the OpenGL context. Each managed projector
window shares the context; `glfwMakeContextCurrent` is called on the
projector window only when actually swapping buffers, otherwise all
draws go to the editor window's invisible surface.

## Open questions

- **Lens distortion**: future work. We anticipate a per-projector lens
  model (k1, k2, p1, p2) applied as a final shader pass before swap.
- **3D mapping**: out of scope for v0.1. The plan is to author 3D models
  in Blender, mark UV islands as "content surfaces", and have soupmix
  treat each island as a `Surface` whose warp is a fixed pre-baked mesh.
