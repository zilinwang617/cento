# Design QA

## Evidence

- Source visual truth: [`qa-reference.png`](./qa-reference.png)
- Implementation screenshot: [`qa-implementation.png`](./qa-implementation.png)
- Combined comparison: [`qa-comparison.png`](./qa-comparison.png) (source left, implementation right)
- Viewport and state: desktop, 1280 × 720 CSS px, device scale factor 1, resting paper state.
- Density normalization: the 1487 × 1057 source was center-cropped to 16:9 and resized to 1280 × 720; the browser implementation capture is 1280 × 720. Both comparison halves were resized to 640 × 360 without changing aspect ratio.
- Focused-region comparison was not needed: the single paper strip occupies roughly half the viewport width and its typography, edges, fiber treatment, and shadow remain clearly readable in the full-view comparison.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Typography: condensed lowercase lettering, weight, tracking, centering, and contrast match the source hierarchy.
- Spacing and layout: the paper width, vertical placement, rotation, and surrounding negative space match the source composition.
- Colors and tokens: the implementation retains the dark espresso wood, cool ivory paper, warm center light, and dark edge vignette.
- Image quality: the generated wood asset is sharp at the target viewport. The paper uses no image texture by design; its translucency, fibers, edge light, and thickness are CSS-rendered.
- Copy: `the moon remembers` matches the source exactly.

## Interaction Verification

- Pointer drag preserves the grab offset and moves by the expected pointer delta.
- Dragging against the top-left boundary clamps both coordinates to the 18px desktop gutter.
- Release returns the strip to the resting shadow and base rotation.
- Arrow keys move by 8px; Shift + arrow moves by 24px.
- Browser console produced no warnings or errors.

## Comparison History

1. The first pass showed a regular dot pattern and paper that was too opaque. Replaced the dots with layered directional fibers and increased translucency.
2. The second pass showed a visible grid. Reduced the cross-fiber strength, varied the fiber angles and spacing, and adjusted the desk's warm center light.
3. The capture exposed an initial slide-in caused by the transform transition. The paper now completes its centered layout while invisible and then fades in without moving.

## Follow-up Polish

- P3: CSS-only fibers remain more linear and less stochastic than the generated reference's raster texture. This is an accepted consequence of the explicit no-paper-image constraint.
- P3: the generated wood asset is slightly cooler and more horizontally grained than the reference, but preserves the intended contrast and material hierarchy.

## Final Result

final result: passed
