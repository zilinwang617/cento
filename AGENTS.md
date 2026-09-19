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
