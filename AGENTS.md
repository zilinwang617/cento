# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Prototype-specific decisions

- The latest source of truth is Figma `RNdrvPrcyNqPQ32ICmm4Pa`, Desktop - 3 (`1:21`), 1440 × 1024. The earlier single-strip wood scene is superseded.
- Use the current Figma cream page / cobalt strips as the default; keep the attached screenshot's teal page / cream strips as the Tidal palette.
- Preserve the Figma object imagery and fonts: Special Elite for strips, Pacifico for Change Style. Exact source assets and licensed fonts are stored locally.
- Selectively retain opaque paper, subtle CSS texture and contact shadows, grip-aware lift / landing motion. Do not carry over the transparent wood-paper aesthetic or add a physics engine.
- Scissors toggle cutting mode (not a text-input dialog). In cutting mode the large scissors fade, the cursor is a small pair of scissors, and only the hovered word gap gets a cut indicator. Clicking it splits the strip in place, retaining text positions and rotation. This works in both the left tray and the right page. Escape or clicking scissors again restores grab / drag mode.
- Cutting targets should be forgiving and immediate: a 16-screen-pixel acquisition radius, 22-pixel release radius, and 8-pixel paper-edge tolerance. Keep a single nearest-gap indicator, no hover delay or guide animation; cache text metrics instead of re-measuring each pointer movement.
- Double-clicking empty left-tray space opens the existing text input. Change Style changes the palette, and Export saves only the composed page. No backend, persistence or deployment is required.
- Target the desktop experience only; do not create or QA a dedicated mobile layout.
- Libraries are allowed; the user does not require a native-CSS-only implementation. Prioritize showing a working visual iteration before exhaustive debugging unless asked otherwise.
- Paper strips should not show a dashed focus outline when clicked or dragged; use the existing lift and shadow as drag feedback.
- The future Chrome Extension sidebar is a scrollable, automatically sorted linear inbox. Its item sequence must stay consistent with the corresponding sequence on the main website. New captures follow one shared deterministic sorting rule; cutting replaces the original item in place with its left and right children in text order, while deletion removes the item without disturbing the relative order of the remaining items.
- The Extension MVP should offer drag-to-collect plus a context-menu fallback, with no keyboard shortcut. Main-site cuts and deletions sync back to the sidebar, while spatial composition state such as position, rotation, and z-order remains main-site-only.
- The main website's left sidebar uses an explicit note-ID sequence, independent of x/y coordinates and z-index. New batches go first (newest first), retaining reading order within a batch; manual drag reordering updates the stored sequence. Cuts replace the parent in place with left/right children. Use sequential, variable-width row packing with fixed horizontal and vertical gaps, no overlap and no backfilling that changes sequence; sidebar strips rest straight. Overflow scrolls vertically, with placeholder/reflow feedback and edge autoscroll during dragging. Canvas composition stays spatial. These sidebar layout rules supersede the earlier in-place cut-position rule for sidebar strips only.
- Run extension acceptance checks in Google Chrome, not Arc; Arc-specific side-panel behavior can hide Chrome Extension bugs.
- The Extension minimum is Chrome 116 because context-menu auto-open depends on `chrome.sidePanel.open()`; the base Side Panel API exists in 114, but that method does not.
