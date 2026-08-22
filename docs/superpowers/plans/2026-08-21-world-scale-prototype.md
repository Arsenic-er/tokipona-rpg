# World Scale Prototype Implementation Plan

**Goal:** Add an isolated, playable N00/N01 scale experiment with three portrait viewport profiles, deterministic micro-material rendering, and one temporary animated character while preserving all existing logic and production pages.

**Architecture:** A pure immutable visual projector reads verified generated scene data plus a real `RuntimeSnapshot`. A separate Vite entry owns canvas rendering and advances a real `PrologueFlowSession`; display-profile changes never write runtime or save state.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite multi-page build, existing fixed-step runtime and generated content readers.

**Spec:** `docs/superpowers/specs/2026-08-21-world-scale-prototype-design.md`

**Global Constraints:** Keep `WORLD_TILE_SIZE_PX=16`, `DEFAULT_PLAYER_BODY=12x14`, existing YAML/generated artifacts, GameSession/WAL schemas, `rpg.html`, and `src/rpg-main.ts` unchanged. All edits stay on `codex/world-scale-prototype` until separately authorized for integration.

---

### Task 1: Lock the display-only scale contract

**Files:**
- Create: `src/visual/world-scale-prototype.test.ts`
- Create: `src/visual/world-scale-prototype.ts`

1. Write failing tests for the exact `current=180x320`, `medium=270x480`, and `wide_world=360x640` viewport profiles.
2. Assert every profile keeps `macroTilePx=16`, `materialCellPx=2`, and `particleCellPx=1`.
3. Run `pnpm exec vitest run src/visual/world-scale-prototype.test.ts` and confirm failure because the module does not exist.
4. Implement readonly profile lookup with strict unknown-profile rejection.
5. Re-run the focused test and confirm green.

### Task 2: Project the real generated world without mutation

**Files:**
- Modify: `src/visual/world-scale-prototype.test.ts`
- Modify: `src/visual/world-scale-prototype.ts`

1. Add failing tests using `readRuntimeSceneManifestIndex` and a real fresh `PrologueFlowSession` snapshot.
2. Assert projection preserves scene identity, world coordinates, macro collision cells, and camera bounds for all profiles.
3. Assert the scene manifest, runtime snapshot, and `flow.toSave()` remain structurally identical after projection.
4. Implement camera projection and deterministic visible-solid-cell extraction.
5. Implement deterministic `2x2` micro-material cell generation derived only from scene/tile coordinates.
6. Re-run the focused test.

### Task 3: Derive a temporary character scale and animation

**Files:**
- Modify: `src/visual/world-scale-prototype.test.ts`
- Modify: `src/visual/world-scale-prototype.ts`

1. Add failing table tests for idle, run, rise, fall, and land pose derivation.
2. Assert the projected body remains `12x14` world pixels in every viewport profile.
3. Implement facing, animation state, gait frame, and screen-space pose projection from immutable runtime values and a display-only prior pose.
4. Assert no character result contains mutator functions or gameplay commands.
5. Re-run the focused test.

### Task 4: Add the isolated playable browser page

**Files:**
- Create: `world-scale.html`
- Create: `src/world-scale-main.ts`
- Create: `src/world-scale.css`
- Modify: `vite.config.ts`
- Create: `src/world-scale-main.test.ts`

1. Add a failing static-boundary test requiring a separate page, semantic profile controls, and absence of storage/WAL/GameSession mutation APIs in the visual module.
2. Add `world-scale.html` to Vite's multi-page input.
3. Implement a minimal experiment shell with one canvas, three scale buttons, compact diagnostics, and WASD/arrow/space controls.
4. Instantiate one real `PrologueFlowSession.fresh`, drive it using `advanceTicks`, and render the generated current scene through the projector.
5. Render deterministic rock/soil micro cells and the temporary character with nearest-neighbor Canvas 2D operations.
6. Preserve the same flow instance when switching profiles.
7. Re-run focused tests and `pnpm run typecheck`.

### Task 5: Prove logic parity and visually inspect the result

**Files:**
- Modify: `src/visual/world-scale-prototype.test.ts`
- Modify: `src/world-scale-main.test.ts`

1. Add a parity test that runs the same input sequence three times while rendering different profiles and compares runtime snapshots plus save output.
2. Add an N00-to-N01 transition test using the real scene/runtime route.
3. Run focused tests.
4. Run `pnpm run content:check`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.
5. Start Vite on a separate local port and inspect all three profiles in a real browser.
6. Verify movement, jump/fall poses, transition, sharp pixel output, diagnostics, and that `rpg.html` is unchanged.
7. Report the clickable prototype URL and measured differences; do not commit, merge, or push without separate authorization.
