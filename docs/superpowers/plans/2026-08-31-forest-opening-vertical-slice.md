# Forest Opening Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, saveable 10–15 minute Chapter 1 opening from forest arrival through the damaged stream road to the settlement perimeter, without combat, teleportation, or early spellcasting.

**Architecture:** Keep `PrologueFlowSession` / `GameSession` as the sole story authority, promote the continuous forest graybox into a narrow spatial/material/ecology runtime, and connect the two through a trusted coordinator. Render a browser-safe view DTO through a new formal entry that loads only approved public runtime assets; private candidates remain in the private asset repository until the user approves them.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 4, Playwright 1.62, Canvas 2D, existing fixed-step runtime and canonical SHA-256 utilities, Python/Pillow asset build scripts in the private repository, Node 22.14.0 and pnpm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-08-31-forest-opening-vertical-slice-design.md`

## Global Constraints

- Use Node `>=22.13 <23`; verification evidence must identify Node 22.
- Preserve `PrologueFlowSession` / `GameSession` as the only quest, learning, checkpoint, and settlement-entry authority.
- `telo` is an unknown glyph only: no meaning, pronunciation, learning evidence, MP action, or spell access.
- The route must support `stone_steps`, `deadwood_bridge`, and `shallow_detour`; none may require a kill.
- The default traveler is about `20 px` tall, uses the existing `12×14` collision body, and has no glow.
- The baseline viewport is `640×360`; logical height remains `360 px`, with extra horizontal world space on wider displays.
- Public builds may load only approved, hash-verified runtime exports; no private paths, concepts, candidates, or review images.
- Do not copy Noita, Rain World, or other games' assets, levels, characters, exact palettes, or animations.
- Every production change follows RED → GREEN TDD and receives a focused test gate before commit.
- Intermediate grayboxes and asset candidates must be labeled as such, never as a completed playable slice.

---

## File Structure

### Public game repository

- `data/chapters/ch01-opening-slice.v0.1.yaml`: authored slice IDs, solutions, glyph observation, ecology, audio roles, and completion boundary.
- `scripts/content/forest-opening-runtime-artifact.ts`: strict source-to-runtime projection.
- `src/content/runtime-forest-opening-manifest.ts`: branded, digest-verifying runtime reader.
- `src/world/forest-opening-runtime.ts`: fixed-step spatial state, obstacle objects, limited material pocket, and ecology composition.
- `src/world/forest-opening-obstacle.ts`: pure three-solution obstacle state machine and AABB rules.
- `src/world/forest-opening-ecology.ts`: deterministic rabbit and wetland-bird behavior.
- `src/game/prologue-forest-opening.ts`: trusted bridge from verified spatial outcomes to existing arrival/stream semantic APIs.
- `src/persistence/browser-forest-opening-persistence.ts`: checksummed GameSession + spatial companion envelope.
- `src/assets/runtime-forest-opening-assets.ts`: exact approved public asset contract and strict reader.
- `src/assets/runtime-forest-opening-private-export.v0.1.json`: missing/approved handoff record; begins fail-closed as `missing`.
- `src/visual/forest-opening-view.ts`: narrow view DTO, animation selection, draw commands, and no domain state.
- `src/audio/browser-forest-opening-audio.ts`: distance/region mixer consuming approved sound roles.
- `src/forest-opening-main.ts`, `chapter-one.html`, `src/forest-opening.css`: formal browser entry.
- `e2e/forest-opening-slice.spec.ts`: desktop/mobile route, save/reload, visual boundary, audio and zero-kill gate.

### Private asset repository (`C:/Users/jiang/Documents/tokipona-asset`)

- `manifests/forest-chapter/opening-slice.v001.yaml`: candidate and approval authority.
- `source/art/production/forest-chapter/opening-slice/v001/`: editable environment, traveler, creature, prop, and glyph sources.
- `source/audio/forest-chapter/opening-slice/v001/`: editable ambience, foley, and dialogue-blip sources.
- `scripts/forest/build_opening_slice_pack.py`: deterministic normalizer/exporter.
- `scripts/forest/test_build_opening_slice_pack.py`: size, alpha, palette, frame, audio, approval, and privacy gates.
- `review/forest-chapter/opening-slice/v001/`: dawn/day screenshots, motion sheets, creature sheet, audio comparison, and capture video.
- `exports/runtime/forest-chapter/opening-slice/v0.1/`: approved exact public handoff only.

---

### Task 0: Stabilize the Existing Full-Suite Baseline

**Files:**
- Modify: `src/visual/forest-graybox-controller.test.ts:103-132`
- Test: `src/world/forest-graybox-runtime.test.ts`
- Test: `e2e/world-scale-graybox.spec.ts`

**Interfaces:**
- Consumes: existing `ForestGrayboxController.advanceTicks`, existing full-route runtime and Playwright tests.
- Produces: a controller-domain isolation test whose cost does not scale with the full forest route.

- [ ] **Step 1: Replace the overloaded controller test with a failing cost-bounded assertion**

  Change the test to advance `120` ticks, assert that the player moves, and byte-compare a real `PrologueFlowSession` save before/after. Add an assertion that this unit test does not attempt to prove the full route; the existing runtime and E2E files retain that responsibility.

  ```ts
  it("advances spatial state without mutating a real Flow save", () => {
    const flow = PrologueFlowSession.fresh({
      sessionId: "forest.controller.domain-nonmutation",
      currentMp: 12,
      maxMp: 24,
    });
    const before = JSON.stringify(flow.toSave());
    const controller = ForestGrayboxController.fresh({ seed: "forest.controller.route" });
    const initialX = controller.snapshot().runtime.player.position.x;

    const after = controller.advanceTicks(120, { moveX: 1 });

    expect(after.runtime.player.position.x).toBeGreaterThan(initialX);
    expect(JSON.stringify(flow.toSave())).toBe(before);
  });
  ```

- [ ] **Step 2: Verify responsibility remains covered**

  Run:

  ```powershell
  pnpm exec vitest run src/visual/forest-graybox-controller.test.ts src/world/forest-graybox-runtime.test.ts
  pnpm exec playwright test e2e/world-scale-graybox.spec.ts
  ```

  Expected: controller isolation, lower-level full route, and desktop/mobile full route all PASS.

- [ ] **Step 3: Run the normal full suite twice**

  Run: `pnpm test -- --reporter=dot` twice under Node 22.

  Expected: `157 files / 992 tests` PASS both times without increasing global `testTimeout`.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/visual/forest-graybox-controller.test.ts
  git commit -m "test(world): bound graybox controller isolation gate"
  ```

### Task 1: Author and Project the Opening Slice Contract

**Files:**
- Create: `data/chapters/ch01-opening-slice.v0.1.yaml`
- Create: `scripts/content/forest-opening-runtime-artifact.ts`
- Create: `scripts/content/forest-opening-runtime-artifact.test.ts`
- Create: `src/content/runtime-forest-opening-manifest.ts`
- Create: `src/content/runtime-forest-opening-manifest.test.ts`
- Modify: `src/content/types.ts`
- Modify: `src/content/compiler.ts`
- Modify: `src/content/index.ts`
- Modify: `scripts/content/runtime-artifact.ts`
- Modify: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: canonical forest district/scene IDs from `RuntimeForestSpatialManifest`.
- Produces: `readRuntimeForestOpeningManifest(candidate): RuntimeForestOpeningManifest` and a branded manifest with exact route, obstacle, glyph, ecology, audio, and asset roles.

- [ ] **Step 1: Write RED source-projection tests**

  The canonical source must project these exact identities:

  ```ts
  const EXPECTED = {
    sliceId: "ch01_forest_opening_vertical_slice",
    districtIds: ["forest.arrival", "forest.stream", "forest.settlement"],
    sceneIds: [
      "scene.valley.arrival_shelf",
      "scene.valley.stream_section",
      "scene.valley.settlement",
    ],
    solutionIds: ["stone_steps", "deadwood_bridge", "shallow_detour"],
    glyphObservation: {
      wordId: "word.telo",
      grantsMeaning: false,
      grantsPronunciation: false,
      grantsLearningEvidence: false,
      grantsSpellAccess: false,
    },
    visibleSpeciesIds: ["forest.rabbit", "forest.wetland_bird"],
  } as const;
  ```

  Add negative source probes for a fourth solution, active `telo` grant, combat requirement, missing zero-kill rule, unknown species, or route order drift.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec vitest run scripts/content/forest-opening-runtime-artifact.test.ts`

  Expected: FAIL because the projector/source does not exist.

- [ ] **Step 3: Add the exact authored YAML and minimal projector**

  The YAML must contain exact solution mappings:

  ```yaml
  solutions:
    - {solution_id: stone_steps, semantic_action: pushLooseStone}
    - {solution_id: deadwood_bridge, semantic_action: placeRottenLog}
    - {solution_id: shallow_detour, semantic_action: digSoftSoil}
  completion:
    zero_kill_required: true
    settlement_checkpoint_id: checkpoint.forest.settlement_perimeter
  ```

  Project only validated typed fields and compute `sourceDigest` with `sha256Canonical`.

- [ ] **Step 4: Write RED strict-reader tests**

  Test digest tampering, unknown keys, reordered route, changed semantic method, changed glyph grants, duplicate species, and a structurally valid but unbranded object passed to downstream consumers.

- [ ] **Step 5: Implement the branded reader and regenerate**

  Export:

  ```ts
  export function readRuntimeForestOpeningManifest(candidate: unknown): RuntimeForestOpeningManifest;
  export function isVerifiedRuntimeForestOpeningManifest(
    value: unknown,
  ): value is RuntimeForestOpeningManifest;
  ```

  Run:

  ```powershell
  pnpm run content:generate
  pnpm exec vitest run scripts/content/forest-opening-runtime-artifact.test.ts src/content/runtime-forest-opening-manifest.test.ts
  pnpm run content:check
  ```

  Expected: all PASS and generated artifact byte-current.

- [ ] **Step 6: Commit**

  ```powershell
  git add data/chapters/ch01-opening-slice.v0.1.yaml scripts/content/forest-opening-runtime-artifact.ts scripts/content/forest-opening-runtime-artifact.test.ts scripts/content/runtime-artifact.ts src/content/types.ts src/content/compiler.ts src/content/index.ts src/content/runtime-forest-opening-manifest.ts src/content/runtime-forest-opening-manifest.test.ts src/generated/content-runtime.v0.1.json
  git commit -m "feat(content): author forest opening slice contract"
  ```

### Task 2: Build the Saveable Opening Runtime Shell

**Files:**
- Create: `src/world/forest-opening-runtime.ts`
- Create: `src/world/forest-opening-runtime.test.ts`
- Modify: `src/world/forest-graybox-runtime.ts`
- Modify: `src/world/forest-graybox-runtime.test.ts`

**Interfaces:**
- Consumes: branded `RuntimeForestOpeningManifest`, `ForestGrayboxRuntime.save/fromSave`, and `ForestRegion`.
- Produces: `ForestOpeningRuntime.fresh`, `ForestOpeningRuntime.fromSave`, `advanceTicks`, `snapshot`, `save`, `resetToCheckpoint`.

- [ ] **Step 1: Write RED save/restore and fixed-step tests**

  Define the save envelope:

  ```ts
  export interface ForestOpeningRuntimeSave {
    readonly schema: "tokipona.forest-opening-runtime.v0.1";
    readonly manifestDigest: `sha256:${string}`;
    readonly spatial: ForestGrayboxSave;
    readonly obstacle: ForestOpeningObstacleSave;
    readonly ecology: ForestOpeningEcologySave;
    readonly worldMinute: number;
    readonly checksum: `sha256:${string}`;
  }
  ```

  Tests must prove byte-stable fresh state, 30/60 rendering-frame equivalence under the same fixed inputs, exact save/load, checksum rejection, wrong manifest rejection, and checkpoint reset preserving only committed solution identity.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/world/forest-opening-runtime.test.ts`

  Expected: FAIL because `ForestOpeningRuntime` does not exist.

- [ ] **Step 3: Implement the composition shell**

  The shell delegates player/camera/collision to `ForestGrayboxRuntime`. It owns no quest flags and exposes only:

  ```ts
  export interface ForestOpeningSnapshot {
    readonly tick: number;
    readonly worldMinute: number;
    readonly spatial: ForestGrayboxSnapshot;
    readonly obstacle: ForestOpeningObstacleSnapshot;
    readonly ecology: ForestOpeningEcologySnapshot;
    readonly stateDigest: `sha256:${string}`;
  }
  ```

  Keep `ForestGrayboxRuntime` changes limited to any narrowly required restore/checkpoint hook; do not add GameSession imports.

- [ ] **Step 4: Run focused tests and typecheck**

  ```powershell
  pnpm exec vitest run src/world/forest-graybox-runtime.test.ts src/world/forest-opening-runtime.test.ts
  pnpm run typecheck
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/world/forest-opening-runtime.ts src/world/forest-opening-runtime.test.ts src/world/forest-graybox-runtime.ts src/world/forest-graybox-runtime.test.ts
  git commit -m "feat(world): add saveable forest opening runtime"
  ```

### Task 3: Implement the Three-Solution Damaged-Road Obstacle

**Files:**
- Create: `src/world/forest-opening-obstacle.ts`
- Create: `src/world/forest-opening-obstacle.test.ts`
- Modify: `src/world/forest-opening-runtime.ts`
- Modify: `src/world/forest-opening-runtime.test.ts`

**Interfaces:**
- Consumes: exact manifest solution IDs and authored stream obstacle bounds.
- Produces: `ForestOpeningObstacle.applyInteraction`, a canonical solution result, object AABBs, and a `128×64` one-pixel material pocket.

- [ ] **Step 1: Write RED pure-domain tests**

  Required interactions:

  ```ts
  type ForestOpeningInteraction =
    | { kind: "push_stone"; objectId: "stream.stone.a" | "stream.stone.b"; direction: -1 | 1 }
    | { kind: "drag_deadwood"; objectId: "stream.deadwood"; direction: -1 | 1 }
    | { kind: "enter_shallow_detour" };
  ```

  Test full-body proximity, non-finite/unknown rejection, object collision, two correctly seated stones, a correctly bridged deadwood AABB, shallow-detour traversal, exact one-solution commit, idempotent replay, and conflicting solution rejection.

- [ ] **Step 2: Write RED material tests**

  Test water moving one-cell light debris, water + soft soil → mud, no material creation, protected road anchors remaining unchanged, and 30/60 fps equality.

- [ ] **Step 3: Verify RED**

  Run: `pnpm exec vitest run src/world/forest-opening-obstacle.test.ts`

- [ ] **Step 4: Implement the minimal state machine and material pocket**

  Keep material IDs limited to `air`, `water`, `soft_soil`, `mud`, `light_debris`, `stone`, `deadwood`, and `protected_mass`. The update order is fixed top-to-bottom then alternating horizontal direction by tick parity; mass counts before and after every step must match except the authored water inlet/outlet budget.

- [ ] **Step 5: Integrate with the opening runtime**

  `ForestOpeningRuntime` may expose `interact(request)` but not a task-completion method. Completion appears only as a verified obstacle snapshot consumed later by the coordinator.

- [ ] **Step 6: Run focused verification and commit**

  ```powershell
  pnpm exec vitest run src/world/forest-opening-obstacle.test.ts src/world/forest-opening-runtime.test.ts src/world/forest-chunk-stream.test.ts
  pnpm run typecheck
  git add src/world/forest-opening-obstacle.ts src/world/forest-opening-obstacle.test.ts src/world/forest-opening-runtime.ts src/world/forest-opening-runtime.test.ts docs/superpowers/plans/2026-08-31-forest-opening-vertical-slice.md
  git commit -m "feat(world): add damaged stream-road solutions"
  ```

### Task 4: Add Minimal Deterministic Ecology

**Files:**
- Create: `src/world/forest-opening-ecology.ts`
- Create: `src/world/forest-opening-ecology.test.ts`
- Modify: `src/world/forest-opening-runtime.ts`
- Modify: `src/world/forest-opening-runtime.test.ts`

**Interfaces:**
- Consumes: player position/velocity, authored habitat anchors, disturbance events, fixed tick, and world minute.
- Produces: rabbit and wetland-bird state only; no GameSession, combat, loot, or learning events.

- [ ] **Step 1: Write RED behavior-table tests**

  Required states:

  ```ts
  type RabbitMode = "foraging" | "alert" | "fleeing" | "sheltered";
  type WetlandBirdMode = "wading" | "alert" | "taking_off" | "departed";
  ```

  Test deterministic foraging, sight/noise alert, rabbit route to the shrub anchor, bird takeoff away from the player, no exact hidden-player-coordinate reads beyond the supplied perception frame, save/load, checkpoint recovery, and 30/60 fps equivalence.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/world/forest-opening-ecology.test.ts`

- [ ] **Step 3: Implement the minimal ecology state machine**

  Use a seeded PRNG only for bounded idle timing. Movement goals and perception use authored positions and distance/sound thresholds from the verified manifest. No creature attacks, dies, drops loot, or blocks the critical route.

- [ ] **Step 4: Integrate, verify, and commit**

  ```powershell
  pnpm exec vitest run src/world/forest-opening-ecology.test.ts src/world/forest-opening-runtime.test.ts
  pnpm run typecheck
  git add src/world/forest-opening-ecology.ts src/world/forest-opening-ecology.test.ts src/world/forest-opening-runtime.ts src/world/forest-opening-runtime.test.ts
  git commit -m "feat(world): simulate opening forest wildlife"
  ```

### Task 5: Connect Spatial Outcomes to Existing Chapter Logic

**Files:**
- Create: `src/game/prologue-forest-opening.ts`
- Create: `src/game/prologue-forest-opening.test.ts`
- Modify: `src/game/prologue-flow.ts`
- Modify: `src/game/prologue-flow.test.ts`

**Interfaces:**
- Consumes: branded manifest, `ForestOpeningRuntime`, `PrologueFlowSession`, and existing `pushLooseStone`, `placeRottenLog`, `digSoftSoil`, `enterSettlementSafeEntrance` semantic methods.
- Produces: `PrologueForestOpeningSession` with opaque interaction proofs and a narrow snapshot.

- [ ] **Step 1: Write RED trust-boundary tests**

  Public API:

  ```ts
  class PrologueForestOpeningSession {
    static fresh(options: { sessionId: string; seed: string }): PrologueForestOpeningSession;
    static fromSave(candidate: unknown): PrologueForestOpeningSession;
    advanceTicks(ticks: number, input?: RuntimeInput): ForestOpeningPublicView;
    interact(operationId: string, request: ForestOpeningInteraction): ForestOpeningActionResult;
    observeGlyph(operationId: string): ForestOpeningActionResult;
    enterSettlementPerimeter(operationId: string): ForestOpeningActionResult;
    save(): ForestOpeningBrowserSave;
  }
  ```

  Tests must reject caller-supplied positions, solution IDs, task flags, `telo` meaning/evidence, remote interactions, stale spatial revision, replayed proof, solution conflicts, early settlement entry, and forged direct GameSession events.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/game/prologue-forest-opening.test.ts`

- [ ] **Step 3: Implement the trusted coordinator**

  Map only verified physical completion:

  ```ts
  const SEMANTIC_ACTION = {
    stone_steps: "pushLooseStone",
    deadwood_bridge: "placeRottenLog",
    shallow_detour: "digSoftSoil",
  } as const;
  ```

  Glyph observation writes only an opening-specific observation receipt and never calls learning adapters. Settlement entry calls the existing semantic method only after physical overlap with the authored perimeter entrance and route completion.

- [ ] **Step 4: Add save/replay and zero-kill tests**

  Save after each solution, reload, enter settlement, replay the same operation, and assert one semantic completion, one checkpoint, `killCount === 0`, no learning evidence, and no MP delta.

- [ ] **Step 5: Verify and commit**

  ```powershell
  pnpm exec vitest run src/game/prologue-forest-opening.test.ts src/game/prologue-flow.test.ts src/game/prologue-arrival-stream.test.ts
  pnpm run typecheck
  git add src/game/prologue-forest-opening.ts src/game/prologue-forest-opening.test.ts src/game/prologue-flow.ts src/game/prologue-flow.test.ts
  git commit -m "feat(game): connect forest opening spatial outcomes"
  ```

### Task 6: Persist the Combined Slice Safely

**Files:**
- Create: `src/persistence/browser-forest-opening-persistence.ts`
- Create: `src/persistence/browser-forest-opening-persistence.test.ts`
- Modify: `src/game/prologue-forest-opening.ts`
- Modify: `src/game/prologue-forest-opening.test.ts`

**Interfaces:**
- Consumes: `GameSessionSave`, `ForestOpeningRuntimeSave`, existing canonical SHA-256.
- Produces: strict browser envelope read/write/migration and `pagehide`-safe persistence port.

- [ ] **Step 1: Write RED envelope tests**

  ```ts
  interface ForestOpeningBrowserSave {
    readonly schema: "tokipona.browser-forest-opening.v0.1";
    readonly savedAtTick: number;
    readonly session: GameSessionSave;
    readonly spatial: ForestOpeningRuntimeSave;
    readonly checksum: `sha256:${string}`;
  }
  ```

  Test exact keys, nested tampering, mismatched session/topology, corrupt JSON, duplicate writes, stale checkpoint, and no fallback to a new save.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec vitest run src/persistence/browser-forest-opening-persistence.test.ts`

- [ ] **Step 3: Implement strict storage and recovery results**

  Return a tagged result instead of throwing into a blank page:

  ```ts
  type ForestOpeningLoadResult =
    | { ok: true; save: ForestOpeningBrowserSave }
    | { ok: false; reason: "missing" | "invalid_json" | "invalid_save" | "incompatible" };
  ```

  Expose export-backup and explicit reset helpers; never silently erase corrupt bytes.

- [ ] **Step 4: Verify and commit**

  ```powershell
  pnpm exec vitest run src/persistence/browser-forest-opening-persistence.test.ts src/game/prologue-forest-opening.test.ts
  pnpm run typecheck
  git add src/persistence/browser-forest-opening-persistence.ts src/persistence/browser-forest-opening-persistence.test.ts src/game/prologue-forest-opening.ts src/game/prologue-forest-opening.test.ts
  git commit -m "feat(persistence): save forest opening slice"
  ```

### Task 7: Establish the Two-Repository Asset Contract and Produce Candidates

**Files (public):**
- Create: `src/assets/runtime-forest-opening-assets.ts`
- Create: `src/assets/runtime-forest-opening-assets.test.ts`
- Create: `src/assets/runtime-forest-opening-private-export.v0.1.json`
- Modify: `scripts/assets/release-gate.ts`
- Modify: `scripts/assets/release-gate.test.ts`
- Modify: `scripts/assets/public-runtime-boundary.ts`
- Modify: `scripts/assets/public-runtime-boundary.test.ts`

**Files (private):**
- Create: `manifests/forest-chapter/opening-slice.v001.yaml`
- Create: `scripts/forest/build_opening_slice_pack.py`
- Create: `scripts/forest/test_build_opening_slice_pack.py`
- Create candidates/review outputs under the exact directories listed in File Structure.

**Interfaces:**
- Consumes: user-approved design, private candidate sources, license records.
- Produces: strict public reader; after the visual audit only, exact `forest.opening.vertical-slice.v001` export.

- [ ] **Step 1: Write RED public asset reader tests**

  Exact runtime roles:

  ```ts
  type ForestOpeningAssetRole =
    | "far_parallax_atlas"
    | "mid_parallax_atlas"
    | "environment_atlas"
    | "prop_glyph_atlas"
    | "traveler_atlas"
    | "creature_atlas"
    | "animation_manifest"
    | "time_palette"
    | "audio_manifest"
    | "forest_ambience"
    | "stream_ambience"
    | "foley_bank"
    | "dialogue_blip_bank";
  ```

  Tests reject missing/extra roles, duplicate paths, wrong hashes, private/concept/review path markers, unapproved status, non-binary alpha for sprites, traveler frame bounds over 20 px, and missing license/accessibility approvals.

- [ ] **Step 2: Verify RED then implement fail-closed public contract**

  Keep `runtime-forest-opening-private-export.v0.1.json` at:

  ```json
  {"schemaVersion":"tokipona.forest-opening-private-export.v0.1","status":"missing"}
  ```

  Run focused public asset tests and `pnpm run assets:check`; expected state is `safe_blocked_pending_external_approval`.

- [ ] **Step 3: Create an isolated private-repo worktree**

  Do not modify or stage the private repository's existing dirty primary worktree. Create `codex/forest-opening-vertical-slice-assets` in its ignored `.worktrees/` directory and copy no untracked file implicitly.

- [ ] **Step 4: Write RED private builder tests**

  Test exact role set, source provenance, dimensions, palette limit `<=64` colors per sprite atlas, binary alpha, traveler frame visual height `<=20`, animation anchor consistency, loop seam thresholds, OGG/WAV decode, peak below `-1 dBFS`, no clipped samples, deterministic hashes, and false approval export rejection.

- [ ] **Step 5: Produce original candidates**

  Create modular dark-forest components rather than complete scene paintings. Candidate deliverables must include dawn/day `1440×900` and landscape-mobile `844×390` captures, traveler nine-action sheet, rabbit/bird motion sheet, material/prop atlas sheet, and an audio A/B page. Preserve existing rejected v001–v003 waterwheel files byte-for-byte.

- [ ] **Step 6: Stop at the user visual/audio audit gate**

  All private manifest approval fields remain false and no public export is copied. Present review outputs to the user. Only an explicit approval authorizes the next step.

- [ ] **Step 7: After approval, build and copy the exact handoff**

  Run the private builder in approved mode, copy only its manifest-listed files to `public/assets/forest-chapter/opening-slice/v0.1/`, update the public handoff JSON with hashes, then run `pnpm run assets:check`.

- [ ] **Step 8: Commit each repository independently**

  Public commit: `feat(assets): admit approved forest opening pack`

  Private commit: `feat(forest): produce opening slice asset pack`

  Do not push either repository until verification passes.

### Task 8: Render the Formal Slice and Mix Audio

**Files:**
- Create: `src/visual/forest-opening-view.ts`
- Create: `src/visual/forest-opening-view.test.ts`
- Create: `src/audio/browser-forest-opening-audio.ts`
- Create: `src/audio/browser-forest-opening-audio.test.ts`
- Create: `src/forest-opening-main.ts`
- Create: `src/forest-opening-main.test.ts`
- Create: `src/forest-opening.css`
- Create: `chapter-one.html`
- Modify: `vite.config.ts`
- Modify: `scripts/build/bundle-budget.ts`
- Modify: `scripts/build/bundle-budget.test.ts`

**Interfaces:**
- Consumes: approved `RuntimeForestOpeningAssetPack` and `ForestOpeningPublicView`.
- Produces: full-screen Canvas rendering, animation/audio commands, and the formal browser entry.

- [ ] **Step 1: Write RED narrow-view tests**

  The public view contains only:

  ```ts
  interface ForestOpeningPublicView {
    readonly mode: "forest_opening" | "settlement_perimeter";
    readonly tick: number;
    readonly worldMinute: number;
    readonly camera: ForestCameraState;
    readonly traveler: { position: Vec2; facing: -1 | 1; animationId: string; frame: number };
    readonly environment: readonly ForestOpeningDrawCommand[];
    readonly obstacle: { interactionPrompt: string | null; visuallyComplete: boolean };
    readonly creatures: readonly ForestOpeningCreatureView[];
    readonly dialogue: { speakerId: string; text: string } | null;
    readonly hud: { health: number; maxHealth: number; mp: number; maxMp: number; objective: string };
  }
  ```

  Add source-boundary tests proving no `GameSessionState`, flags, receipts, raw learning evidence, damage override, private path, or debug mutation commands enter the view.

- [ ] **Step 2: Verify RED and implement draw-command projection**

  Produce four depth layers, traveler animation, obstacle/creature views, dawn-to-day palette projection, and pixel-aligned camera output. The renderer consumes commands and never reads the coordinator directly.

- [ ] **Step 3: Write RED browser-audio tests**

  Test distance attenuation, district crossfade, surface footsteps, object collision, water entry, dialogue blips, mute preference, suspend/resume, and missing-role failure before activation.

- [ ] **Step 4: Implement audio mixer and formal entry**

  `chapter-one.html` contains only the game surface, narrow HUD, touch controls, pause/settings, and explicit recovery diagnostics. It must not display seed, tick, topology digest, audit profile, or debug buttons.

- [ ] **Step 5: Add bundle boundary and budget**

  Add `chapter-one.html` to Vite input. Assert its static closure does not include developer graybox UI or private asset readers, and set a measured initial JS/request budget after the first green build without weakening existing entry budgets.

- [ ] **Step 6: Verify and commit**

  ```powershell
  pnpm exec vitest run src/visual/forest-opening-view.test.ts src/audio/browser-forest-opening-audio.test.ts src/forest-opening-main.test.ts scripts/build/bundle-budget.test.ts
  pnpm run typecheck
  pnpm run build
  git add chapter-one.html src/forest-opening-main.ts src/forest-opening-main.test.ts src/forest-opening.css src/visual/forest-opening-view.ts src/visual/forest-opening-view.test.ts src/audio/browser-forest-opening-audio.ts src/audio/browser-forest-opening-audio.test.ts vite.config.ts scripts/build/bundle-budget.ts scripts/build/bundle-budget.test.ts
  git commit -m "feat(game): render forest opening vertical slice"
  ```

### Task 9: Gate the Complete Slice in Browser and Release Checks

**Files:**
- Create: `e2e/forest-opening-slice.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Create: `docs/testing/forest-opening-slice-acceptance.md`

**Interfaces:**
- Consumes: formal browser entry and all earlier contracts.
- Produces: reproducible desktop/mobile evidence and a release command covering the complete slice.

- [ ] **Step 1: Write RED desktop and mobile E2E**

  Cover keyboard `1440×900` and landscape touch `844×390`. Assert:

  - full-screen game surface with no audit panel;
  - traveler bounds intersect the viewport throughout;
  - arrival → stream → settlement-perimeter route without navigation or teleport;
  - each solution in a clean save reaches the same semantic completion;
  - rabbit flees and bird departs without blocking the route;
  - glyph observation creates no learning evidence, word meaning, pronunciation, MP change, or spell access;
  - `killCount === 0`;
  - save, page close, reload, and checkpoint reset preserve committed outcomes without duplication;
  - no console/page errors, private paths, or missing audio roles.

- [ ] **Step 2: Verify RED**

  Run: `pnpm exec playwright test e2e/forest-opening-slice.spec.ts`

  Expected: FAIL until the formal entry is complete and the asset pack is approved.

- [ ] **Step 3: Complete browser wiring only where failures identify missing integration**

  Do not add test hooks that mutate position, solution, flags, materials, or ecology. Read-only audit evidence may expose semantic IDs and physical screen bounds only in test builds.

- [ ] **Step 4: Add release command and documentation**

  Add `test:forest-opening` that runs focused unit/integration tests, build, asset check, and the new E2E. Document controls, expected duration, recovery, and the explicit distinction between the formal slice and `world-scale.html`.

- [ ] **Step 5: Run final gates**

  ```powershell
  pnpm run content:check
  pnpm run assets:check
  pnpm run typecheck
  pnpm test -- --reporter=dot
  pnpm run build
  pnpm exec playwright test e2e/forest-opening-slice.spec.ts e2e/world-scale-graybox.spec.ts
  pnpm run test:forest-opening
  git diff --check
  ```

  Expected: all PASS under Node 22; no retries required.

- [ ] **Step 6: Capture user audit evidence**

  Preserve desktop/mobile dawn, obstacle, NPC, and settlement-perimeter screenshots plus one complete no-commentary playthrough video. Present these as the final visual/play audit; do not claim acceptance before the user reviews them.

- [ ] **Step 7: Commit**

  ```powershell
  git add e2e/forest-opening-slice.spec.ts playwright.config.ts package.json docs/testing/forest-opening-slice-acceptance.md
  git commit -m "test(game): gate forest opening vertical slice"
  ```
