# N00–N01 World Visual Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete stages 2–5 of the visual refactor for the isolated N00→N01 prototype without changing existing gameplay or persistence authority.

**Architecture:** Four pure visual modules project environment, character pixels, VFX, and interaction prompts from verified scene/runtime state. The existing prototype controller remains the only mutable boundary and delegates contextual actions to existing `PrologueFlowSession` methods; the browser entry only composes projections and binds narrow controls.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite, existing generated content readers and fixed-step prologue runtime.

**Spec:** `docs/superpowers/specs/2026-08-21-world-visual-vertical-slice-design.md`

## Global Constraints

- Keep `WORLD_TILE_SIZE_PX=16` and `DEFAULT_PLAYER_BODY=12×14`.
- Keep N00/N01 authored content, collision, exits, physics, GameSession, WAL, production `rpg.html`, and `src/rpg-main.ts` unchanged.
- Use only deterministic procedural pixels; add no public or private binary asset.
- Default review profile is `medium=270×480`; all three profiles remain available only in the collapsed audit drawer.
- Visual modules are immutable and have no DOM, storage, save, or gameplay mutation dependency.
- Do not commit, merge, or push until the user separately authorizes those Git actions.

---

### Task 1: Deterministic environment projection

**Files:**
- Create: `src/visual/world-environment.ts`
- Create: `src/visual/world-environment.test.ts`
- Modify: `src/visual/world-scale-prototype.ts`

**Interfaces:**
- Consumes: `RuntimeSceneManifest`, `WorldScaleFrame`.
- Produces: `projectWorldEnvironment(scene, frame): WorldEnvironmentProjection` with `farSilhouettes`, `midFormations`, `decorations`, and `palette`.

- [ ] Write failing tests that N00 projects dry/warm ambience, N01 projects wet/cool ambience, every feature is deterministic/frozen, and all decorative features leave the source scene/frame unchanged.
- [ ] Run `pnpm exec vitest run src/visual/world-environment.test.ts`; verify failure because the module is absent.
- [ ] Implement stable scene-hash silhouettes, connected terrain surface classification, and decoration placement on exposed solid tiles.
- [ ] Re-run the focused test; verify pass.

### Task 2: Procedural character pixel rig

**Files:**
- Create: `src/visual/character-pixel-rig.ts`
- Create: `src/visual/character-pixel-rig.test.ts`

**Interfaces:**
- Consumes: `ProjectedPrototypeCharacter`.
- Produces: `projectCharacterPixels(character): CharacterPixelRig` with a `14×19` visual bounds, immutable pixel rectangles, anchor offsets, and landing dust anchors.

- [ ] Write failing table tests for idle, four run phases, rise, fall, land, facing mirroring, exact bounds, and unchanged `12×14` collision body.
- [ ] Run `pnpm exec vitest run src/visual/character-pixel-rig.test.ts`; verify module-not-found failure.
- [ ] Implement the minimal palette and pixel-part projector.
- [ ] Re-run focused tests; verify pass.

### Task 3: Water, atmosphere, lighting, and glyph VFX

**Files:**
- Create: `src/visual/world-vfx.ts`
- Create: `src/visual/world-vfx.test.ts`

**Interfaces:**
- Consumes: `WorldScaleFrame`, optional `WaterVisualBounds`, `GlyphVisualState`, `reducedMotion`.
- Produces: `projectWorldVfx(input): WorldVfxProjection` with waves, foam, motes, dust, lights, fog, and glyph geometry.

- [ ] Write failing tests for no N00 water, bounded N01 waves, finite deterministic particles/lights, phase-distinct glyph output, frozen reduced-motion phases, and landing dust only on `land`.
- [ ] Run the focused test; verify module-not-found failure.
- [ ] Implement bounded deterministic VFX projection with no random source or mutable particle registry.
- [ ] Re-run focused tests; verify pass.

### Task 4: Contextual interaction boundary

**Files:**
- Create: `src/visual/world-interaction.ts`
- Create: `src/visual/world-interaction.test.ts`
- Modify: `src/visual/world-scale-controller.ts`
- Modify: `src/world-scale-main.test.ts`

**Interfaces:**
- Consumes: `PrologueFlowSnapshot`.
- Produces: `projectWorldInteraction(snapshot): WorldInteractionView` and `WorldScalePrototypeController.interact(): WorldScaleInteractionResult`.

- [ ] Write failing tests for hidden prompts outside N01/range, exact discover/attune/manifest prompts in range, and absence of session/receipt/flag/physics fields.
- [ ] Write failing controller tests proving three real `E` interactions progress existing telo state and that repeated/remote commands fail closed.
- [ ] Run focused tests; confirm the new API is missing.
- [ ] Implement the pure prompt projector and narrow controller delegation using stable prototype operation IDs.
- [ ] Re-run focused tests; verify pass and unchanged save/profile parity tests.

### Task 5: Game-like Canvas composition and reduced UI

**Files:**
- Modify: `world-scale.html`
- Modify: `src/world-scale-main.ts`
- Modify: `src/world-scale.css`
- Create: `src/world-scale-browser-boundary.test.ts`

**Interfaces:**
- Consumes: projections from Tasks 1–4.
- Produces: full-screen playable N00/N01 review slice with collapsed audit drawer and narrow keyboard/touch commands.

- [ ] Write a failing static boundary test requiring the default medium profile, collapsed audit control, contextual prompt/live region, four touch commands, and forbidding persistent lab headers/diagnostics plus raw GameSession/receipt/flag rendering.
- [ ] Run the boundary test; verify it fails against the current laboratory shell.
- [ ] Replace persistent lab chrome with a full-screen frame, short-lived scene title, interaction prompt/toast, and collapsed `V` audit drawer.
- [ ] Compose far environment → mid environment → terrain → water/VFX → character → light/fog → prompt.
- [ ] Bind `E`, `V`, keyboard movement/jump, and coarse-pointer touch controls; keep profile changes display-only.
- [ ] Re-run focused tests and `pnpm run typecheck`.

### Task 6: Audit gate and browser verification

**Files:**
- Modify tests only if a newly reproduced defect first receives a failing regression test.

**Interfaces:**
- Consumes: completed vertical slice.
- Produces: review URL and evidence matrix for stages 2–5.

- [ ] Run all focused visual/controller/build-budget tests.
- [ ] Run `pnpm run content:check`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `git diff --check`.
- [ ] Start Vite at `127.0.0.1:5174` and capture N00/N01 screenshots at current/medium/wide profiles.
- [ ] In a real browser, verify movement, jump/fall/land, N00→N01, three contextual telo interactions, reduced UI, audit drawer, and touch-button visibility rules.
- [ ] Confirm `git diff --name-only -- rpg.html src/rpg-main.ts data src/generated` is empty.
- [ ] Leave the server running and report the local review URL; do not commit, merge, or push.
