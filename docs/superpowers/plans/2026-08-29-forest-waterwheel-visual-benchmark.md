# Forest Waterwheel Visual Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved full-screen forest–waterwheel visual benchmark with reviewed runtime assets, a small non-glowing traveler, four-layer depth, a 48-minute day/night presentation, 1 px visible material detail, and no change to authoritative first-chapter gameplay logic.

**Architecture:** Keep `world-scale.html` as an explicitly non-production art audit page, but replace its portrait scale laboratory with a verified waterwheel scene runtime, a responsive `360`-pixel logical-height viewport, strict public asset exports, and narrow immutable render projections. Asset source and review media stay in the private asset repository; only an approved hash-bound runtime pack enters `public/assets/forest-chapter`. The benchmark uses real fixed-step movement against generated waterwheel collision but does not create GameSession task events; production logic integration remains Stage 5 of the design spec.

**Tech Stack:** TypeScript 7, Vite 8, Canvas 2D, Vitest 4, Playwright, Python 3/Pillow for deterministic pixel-asset packing, YAML manifests, SHA-256 asset verification.

**Spec:** `docs/superpowers/specs/2026-08-29-forest-chapter-art-physics-design.md`

## Global Constraints

- Public repository root: `C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype`.
- Private asset repository root: `C:/Users/jiang/Documents/tokipona-asset`.
- Node must satisfy `>=22.13 <23`; run all public-repository gates with Node 22.
- Baseline logical view is `640×360`; logical height is always `360`, and wider displays reveal more horizontal world up to `960` logical pixels.
- Visible active material detail is `1` logical pixel. `16×16` exists only as the authored collision macro-grid and later hidden simulation chunk size.
- The traveler is approximately `20` logical pixels tall, has no persistent glow, and keeps the existing `12×14` collision body.
- Day/night presentation is a `48`-minute cycle: dawn `6`, day `20`, dusk `6`, night `16` minutes.
- The benchmark may preview time visually, but it must not claim to implement the future authoritative persisted world clock.
- Rendering, art controls, weather hooks, and VFX cannot write GameSession events, learning evidence, MP, damage, flags, receipts, or save data.
- Concept images, source layers, prompts, review captures, and unapproved assets stay in the private repository.
- Public runtime assets require explicit source, license, pixel, animation, accessibility, and hash approval; denial stops export.
- Do not modify first-chapter YAML, generated content, GameSession/WAL schemas, physics rules, production `rpg.html`, or production `src/rpg-main.ts` in this plan.
- Do not implement water/sand/fire/gravity simulation in this plan; that is the next independently testable plan after visual approval.

---

## File Structure

### Private asset repository

- `source/art/concepts/forest-chapter/*.png` — selected composition and scale references; never runtime-ready.
- `ai/prompts/forest-chapter/*.txt` — exact generation/edit prompts for audit provenance.
- `source/art/production/forest-chapter/waterwheel-benchmark/*.png` — editable production candidates and separated layers.
- `exports/runtime/forest-chapter/waterwheel-benchmark/v0.1/*.png` — deterministic, palette-checked runtime PNGs.
- `exports/runtime/forest-chapter/waterwheel-benchmark/v0.1/*.json` — runtime pack and time-palette manifests.
- `manifests/concepts/forest-chapter/*.yaml` — concept-only provenance.
- `manifests/forest-chapter/waterwheel-benchmark.v001.yaml` — source, license, review, approvals, file hashes, and public export declaration.
- `scripts/forest/build_waterwheel_benchmark_export.py` — deterministic dimension, alpha, palette, frame, and SHA validation.
- `scripts/forest/test_build_waterwheel_benchmark_export.py` — private pack builder tests.

### Public game repository

- `scripts/assets/release-gate.ts` — admit the `forest_chapter_visuals` destination and forest-specific approval set.
- `scripts/assets/release-gate.test.ts` — accept approved forest packs and reject source/review leakage.
- `scripts/assets/public-runtime-boundary.ts` — verify the complete public forest file set and hashes without weakening glyph checks.
- `scripts/assets/public-runtime-boundary.test.ts` — fail on undeclared, changed, private, or partial forest files.
- `src/assets/runtime-forest-visual-assets.ts` — strict reader for the private-export authority copied into the public repository.
- `src/assets/runtime-forest-visual-assets.test.ts` — schema, hash, dimension, privacy, and exact-key tests.
- `src/assets/runtime-forest-visual-private-export.v0.1.json` — starts as a fail-closed `missing` record, becomes an approved hash list only after user review.
- `public/assets/forest-chapter/waterwheel-benchmark/v0.1/*` — approved runtime-only PNG/JSON files.
- `src/visual/world-viewport.ts` — responsive `360`-high logical viewport and CSS scale projection.
- `src/visual/world-viewport.test.ts` — 16:9, ultrawide, phone landscape, invalid input, and resize tests.
- `src/visual/world-scale-prototype.ts` — project generated collision to the responsive viewport with 1 px decoration cells and dead-zone camera input.
- `src/visual/world-scale-prototype.test.ts` — viewport/camera/material/collision parity tests.
- `src/visual/waterwheel-visual-benchmark.ts` — audit-only fixed-step runtime owner for the verified waterwheel scene.
- `src/visual/waterwheel-visual-benchmark.test.ts` — scene identity, movement, no-domain-write, and resize tests.
- `src/visual/forest-time-of-day.ts` — pure 48-minute phase and interpolation projection.
- `src/visual/forest-time-of-day.test.ts` — exact phase boundaries and wraparound tests.
- `src/visual/forest-visual-pack.ts` — strict runtime pack parser and image descriptor projection.
- `src/visual/forest-visual-pack.test.ts` — manifest tamper, path, dimension, and frame-map tests.
- `src/visual/world-environment.ts` — four-layer waterwheel environment projection driven by pack and time profile.
- `src/visual/world-environment.test.ts` — deterministic layer order, scene identity, and time-state tests.
- `src/visual/character-pixel-rig.ts` — atlas-frame projection for the layered ~20 px traveler.
- `src/visual/character-pixel-rig.test.ts` — animation, facing, bounds, collision isolation, and no-glow tests.
- `src/visual/world-vfx.ts` — restrained 1 px motes, authored local lights, fog, and water presentation; no player light.
- `src/visual/world-vfx.test.ts` — VFX size, reduced-motion, light-kind, and deterministic tests.
- `src/visual/world-canvas-renderer.ts` — Canvas draw order and image rendering; no DOM or state mutation.
- `src/visual/world-canvas-renderer.test.ts` — command ordering and forbidden authority-input tests.
- `src/visual/world-game-view.ts` — narrow overlay and optional audit view for the new benchmark.
- `src/visual/world-game-view.test.ts` — no session/save/flags/physics leakage.
- `src/world-scale-main.ts` — browser lifecycle, resize, controls, asset loading, and benchmark composition.
- `src/world-scale-main.test.ts` — public page/controller behavior without legacy scale profiles.
- `src/world-scale.css` — full-screen landscape layout, safe-area touch controls, hidden audit drawer, focus, and reduced motion.
- `world-scale.html` — updated benchmark title and description.
- `e2e/world-scale.spec.ts` — desktop/mobile full-screen, movement, audit, and accessibility smoke test.

---

### Task 1: Preserve Selected Concept References in the Private Asset Repository

**Files:**
- Add: `C:/Users/jiang/Documents/tokipona-asset/source/art/concepts/forest-chapter/player-scale-comparison.v001.png`
- Add: `C:/Users/jiang/Documents/tokipona-asset/source/art/concepts/forest-chapter/waterwheel-unified-visual-target.v001.png`
- Add: `C:/Users/jiang/Documents/tokipona-asset/ai/prompts/forest-chapter/player-scale-comparison.v001.txt`
- Add: `C:/Users/jiang/Documents/tokipona-asset/ai/prompts/forest-chapter/waterwheel-unified-visual-target.v001.txt`
- Add: `C:/Users/jiang/Documents/tokipona-asset/manifests/concepts/forest-chapter/player-scale-comparison.v001.yaml`
- Add: `C:/Users/jiang/Documents/tokipona-asset/manifests/concepts/forest-chapter/waterwheel-unified-visual-target.v001.yaml`

**Interfaces:**
- Consumes: the selected comparison and unified concept outputs already present in the private worktree.
- Produces: immutable concept provenance with `allowed_use.runtime=false` and `review.runtime_ready=false`.

- [ ] **Step 1: Verify image and prompt hashes against the manifests**

Run:

```powershell
Get-FileHash source/art/concepts/forest-chapter/player-scale-comparison.v001.png -Algorithm SHA256
Get-FileHash source/art/concepts/forest-chapter/waterwheel-unified-visual-target.v001.png -Algorithm SHA256
Get-FileHash ai/prompts/forest-chapter/player-scale-comparison.v001.txt -Algorithm SHA256
Get-FileHash ai/prompts/forest-chapter/waterwheel-unified-visual-target.v001.txt -Algorithm SHA256
```

Expected image hashes:

```text
18ad78de0c9a0bf25f64971528e1666e03eddabc9362184c1f835723006e7490
c63d0ec9d45b50573635208cd5a66f1fbdfcd6265a39b89207ff227c774b4d58
```

Expected prompt hashes:

```text
cf3f01caeab691ecbe3795fc7f4b042d331ca1bb285e9269bf6875cbf96c3d53
139be237d97ac5024c9288cbe8e29346135783137a70a3782ca829e58c85b9e0
```

- [ ] **Step 2: Verify the concepts are blocked from runtime export**

Run:

```powershell
rg -n "runtime: false|runtime_ready: false|redistribution: false" manifests/concepts/forest-chapter/player-scale-comparison.v001.yaml manifests/concepts/forest-chapter/waterwheel-unified-visual-target.v001.yaml
```

Expected: each manifest contains all three blocking declarations.

- [ ] **Step 3: Check and commit only the six reference files**

Run:

```powershell
git diff --check -- ai/prompts/forest-chapter manifests/concepts/forest-chapter source/art/concepts/forest-chapter
git add -- ai/prompts/forest-chapter/player-scale-comparison.v001.txt ai/prompts/forest-chapter/waterwheel-unified-visual-target.v001.txt manifests/concepts/forest-chapter/player-scale-comparison.v001.yaml manifests/concepts/forest-chapter/waterwheel-unified-visual-target.v001.yaml source/art/concepts/forest-chapter/player-scale-comparison.v001.png source/art/concepts/forest-chapter/waterwheel-unified-visual-target.v001.png
git commit -m "docs(assets): archive forest visual references"
```

Expected: one private-repository commit; no runtime export files are staged.

---

### Task 2: Add a Fail-Closed Forest Visual Asset Boundary

**Files:**
- Create: `src/assets/runtime-forest-visual-assets.ts`
- Create: `src/assets/runtime-forest-visual-assets.test.ts`
- Create: `src/assets/runtime-forest-visual-private-export.v0.1.json`
- Modify: `scripts/assets/release-gate.ts`
- Modify: `scripts/assets/release-gate.test.ts`
- Modify: `scripts/assets/public-runtime-boundary.ts`
- Modify: `scripts/assets/public-runtime-boundary.test.ts`

**Interfaces:**
- Consumes: an unknown JSON candidate copied from the private approved export.
- Produces:

```ts
export type RuntimeForestVisualAssetExport =
  | Readonly<{ schemaVersion: "tokipona.forest-visual-private-export.v0.1"; status: "missing" }>
  | Readonly<{
      schemaVersion: "tokipona.forest-visual-private-export.v0.1";
      status: "approved";
      packId: "forest.waterwheel.visual-benchmark.v001";
      manifestDigest: `sha256:${string}`;
      files: readonly RuntimeForestVisualFile[];
      privacy: RuntimeForestVisualPrivacy;
    }>;

export function readRuntimeForestVisualAssetExport(candidate: unknown): RuntimeForestVisualAssetExport;
```

- [ ] **Step 1: Write failing strict-reader tests**

Add tests that accept exactly the `missing` form, accept one approved fixture, and reject extra keys, duplicate paths, bad SHA-256 values, absolute/private paths, wrong dimensions, review media, or any `privacy` value other than `false`.

```ts
expect(readRuntimeForestVisualAssetExport({
  schemaVersion: "tokipona.forest-visual-private-export.v0.1",
  status: "missing",
})).toEqual({
  schemaVersion: "tokipona.forest-visual-private-export.v0.1",
  status: "missing",
});

expect(() => readRuntimeForestVisualAssetExport({
  ...approvedFixture(),
  sourcePath: "C:/private/source.png",
})).toThrow("forest visual export fields are invalid");
```

- [ ] **Step 2: Run the reader test and verify failure**

Run:

```powershell
pnpm exec vitest run src/assets/runtime-forest-visual-assets.test.ts
```

Expected: FAIL because the reader module does not exist.

- [ ] **Step 3: Implement the exact reader and missing authority file**

Create the initial authority file as:

```json
{
  "schemaVersion": "tokipona.forest-visual-private-export.v0.1",
  "status": "missing"
}
```

The approved reader must require these file roles and exact logical dimensions:

```ts
const REQUIRED_FILES = Object.freeze({
  "background_far": { width: 640, height: 360, extension: ".png" },
  "background_mid": { width: 640, height: 360, extension: ".png" },
  "waterwheel_landmark": { width: 320, height: 192, extension: ".png" },
  "forest_material_atlas": { width: 256, height: 256, extension: ".png" },
  "traveler_atlas": { width: 192, height: 96, extension: ".png" },
  "time_palette": { width: 0, height: 0, extension: ".json" },
  "runtime_manifest": { width: 0, height: 0, extension: ".json" },
} as const);
```

All public paths must match:

```ts
/^assets\/forest-chapter\/waterwheel-benchmark\/v0\.1\/[a-z0-9._-]+\.(?:png|json)$/
```

- [ ] **Step 4: Extend the release gate with forest-specific rules**

Modify `scripts/assets/release-gate.ts` to add:

```ts
export const PUBLIC_FOREST_VISUAL_ROOT = "public/assets/forest-chapter" as const;

const RUNTIME_ROOTS = {
  magic_glyphs: PUBLIC_RUNTIME_ROOT,
  forest_chapter_visuals: PUBLIC_FOREST_VISUAL_ROOT,
} as const;

const FOREST_VISUAL_REQUIRED_APPROVALS = [
  "source", "license", "pixel", "animation", "accessibility", "hashes",
] as const;
```

Add `runtime_layer: [".png"]` to role extensions and permit `runtime_layer`, `runtime_atlas`, `runtime_palette`, and `runtime_manifest` only under `forest_chapter_visuals`. Keep all existing glyph approval and role behavior unchanged.

- [ ] **Step 5: Add release and public-boundary negative tests**

The fixture must prove:

```ts
expect(auditAssetRelease(approvedForestFixture()).decision).toBe("allow");
expect(auditAssetRelease(forestFixtureWithReviewPng()).decision).toBe("deny");
expect(() => checkPublicRuntimeAssetBoundary(inputWithChangedForestPng()))
  .toThrow("approved_public_asset_hash_mismatch");
expect(() => checkPublicRuntimeAssetBoundary(inputWithUndeclaredForestPng()))
  .toThrow("public_forest_file_set_invalid");
```

`checkPublicRuntimeAssetBoundary` must continue to reject every non-glyph, non-forest file.

- [ ] **Step 6: Run focused asset tests**

Run:

```powershell
pnpm exec vitest run src/assets/runtime-forest-visual-assets.test.ts scripts/assets/release-gate.test.ts scripts/assets/public-runtime-boundary.test.ts
pnpm run assets:check
```

Expected: all tests pass; repository report remains safely blocked for forest visuals because the authority file is still `status: "missing"`.

- [ ] **Step 7: Commit the asset-boundary change**

```powershell
git add -- src/assets/runtime-forest-visual-assets.ts src/assets/runtime-forest-visual-assets.test.ts src/assets/runtime-forest-visual-private-export.v0.1.json scripts/assets/release-gate.ts scripts/assets/release-gate.test.ts scripts/assets/public-runtime-boundary.ts scripts/assets/public-runtime-boundary.test.ts
git commit -m "feat(assets): gate forest visual runtime exports"
```

---

### Task 3: Produce, Audit, and Export the Waterwheel Runtime Art Pack

**Files:**
- Create in private repo: `source/art/production/forest-chapter/waterwheel-benchmark/forest-waterwheel-far.v001.png`
- Create in private repo: `source/art/production/forest-chapter/waterwheel-benchmark/forest-waterwheel-mid.v001.png`
- Create in private repo: `source/art/production/forest-chapter/waterwheel-benchmark/forest-waterwheel-landmark.v001.png`
- Create in private repo: `source/art/production/forest-chapter/waterwheel-benchmark/forest-material-atlas.v001.png`
- Create in private repo: `source/art/production/forest-chapter/waterwheel-benchmark/traveler-base-atlas.v001.png`
- Create in private repo: `exports/runtime/forest-chapter/waterwheel-benchmark/v0.1/*`
- Create in private repo: `manifests/forest-chapter/waterwheel-benchmark.v001.yaml`
- Create after approval in private repo: `manifests/releases/runtime-forest-visual-private-export.v0.1.json`
- Create in private repo: `scripts/forest/build_waterwheel_benchmark_export.py`
- Create in private repo: `scripts/forest/test_build_waterwheel_benchmark_export.py`
- Replace after approval in public repo: `src/assets/runtime-forest-visual-private-export.v0.1.json`
- Export after approval in public repo: `public/assets/forest-chapter/waterwheel-benchmark/v0.1/*`

**Interfaces:**
- Consumes: the selected unified concept, player scale concept, and the approved art bible.
- Produces: `forest.waterwheel.visual-benchmark.v001`, a seven-file hash-bound runtime pack.

- [ ] **Step 1: Generate separated production candidates from the approved concept**

Use the image generation skill with the selected unified concept as the only visual reference. Generate each layer separately with these non-negotiable prompt clauses:

```text
Production pixel-art layer for a 640×360 side-view forest waterwheel scene.
Tiny human scale: the player will be about 20 logical pixels tall.
Natural dark-green forest dominates; restrained oxidized copper ruins;
subtle turquoise water reflections; rare amber anomaly accents.
No text, no UI, no character glow, no giant particles, no smooth vector shapes,
no imitation of copyrighted characters, maps, or assets.
Use a limited cohesive palette and hard pixel clusters.
```

Layer-specific clauses:

```text
far: distant forest and geological silhouettes only; no foreground, character, or waterwheel.
mid: nearer tree trunks, roots, mist gaps, and ruined supports on transparent background.
landmark: one large readable wooden waterwheel with moss, stone base, and restrained oxidized copper fittings on transparent background.
material atlas: seamless authored swatches for forest soil, wet soil, mossy rock, old wood, oxidized copper, shallow water edge, and roots.
traveler atlas: slim 20-pixel-tall human traveler, no glow, 24×24 cells, idle/run/rise/fall/land frames, consistent proportions and anchors.
```

- [ ] **Step 2: Write the failing pack-builder tests**

The Python tests must construct temporary images and assert rejection of wrong dimensions, more than `64` non-transparent palette colors per file, partial-alpha fringe pixels, a traveler frame exceeding `20` opaque pixels in height, missing frame names, and non-empty far-layer alpha outside the canvas.

```python
def test_rejects_traveler_taller_than_twenty_pixels(self):
    fixture = self.make_pack(traveler_opaque_height=21)
    with self.assertRaisesRegex(ValueError, "traveler_opaque_height_invalid"):
        build_runtime_pack(fixture)
```

- [ ] **Step 3: Run the private builder test and verify failure**

Run from the private repo:

```powershell
python -m unittest scripts.forest.test_build_waterwheel_benchmark_export -v
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 4: Implement deterministic packing and manifests**

`build_waterwheel_benchmark_export.py` must:

1. resize only with nearest-neighbor sampling;
2. quantize each output to at most `64` non-transparent colors;
3. require alpha values to be exactly `0` or `255` for mid, landmark, material, and traveler images;
4. write the exact dimensions declared in Task 2;
5. write `time-palette.v0.1.json` with `dawn`, `day`, `dusk`, and `night` LUT/ambient values;
6. write `waterwheel-visual-pack.v0.1.json` with the traveler frame map and layer roles;
7. calculate SHA-256 after writing every runtime file;
8. write a review-candidate manifest whose approval booleans default to `false`;
9. support `--emit-approved-export` to write `manifests/releases/runtime-forest-visual-private-export.v0.1.json`, but reject that option unless every required approval in the source manifest is true.

- [ ] **Step 5: Run private validation**

```powershell
python -m unittest scripts.forest.test_build_waterwheel_benchmark_export -v
python scripts/forest/build_waterwheel_benchmark_export.py --asset-root . --manifest manifests/forest-chapter/waterwheel-benchmark.v001.yaml --validate-only
```

Expected: tests pass and the validator reports exact dimensions, palette counts, alpha policy, frame bounds, and hashes.

- [ ] **Step 6: Stop for user visual audit**

Present full-size captures for dawn, day, dusk, and night plus a traveler motion contact sheet. The user must explicitly approve or reject:

- composition and small-player/large-world scale;
- character proportions and animation consistency;
- palette, forest identity, waterwheel landmark, and absence of glow;
- 1 px cluster readability at actual scale;
- night visibility and color-blind distinguishability.

If any item is rejected, return to Step 1. Do not mark the pack runtime-ready and do not export files.

- [ ] **Step 7: Record approval without inventing legal facts**

After explicit approval, record the actual reviewer, date, source ownership, redistribution decision, accessibility result, and generated hashes in `manifests/forest-chapter/waterwheel-benchmark.v001.yaml`. Run the public release gate in dry-run mode:

```powershell
node --experimental-strip-types C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype/scripts/assets/gate-runtime-assets.ts dry-run --asset-root C:/Users/jiang/Documents/tokipona-asset --manifest manifests/forest-chapter/waterwheel-benchmark.v001.yaml --public-root C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype
```

Expected: `decision: "allow"` and `dryRun: true`. A deny result stops the task and must not be overridden.

- [ ] **Step 8: Export and copy the approved authority record**

Run:

```powershell
python scripts/forest/build_waterwheel_benchmark_export.py --asset-root . --manifest manifests/forest-chapter/waterwheel-benchmark.v001.yaml --emit-approved-export
node --experimental-strip-types C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype/scripts/assets/gate-runtime-assets.ts export --asset-root C:/Users/jiang/Documents/tokipona-asset --manifest manifests/forest-chapter/waterwheel-benchmark.v001.yaml --public-root C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype
Copy-Item -LiteralPath C:/Users/jiang/Documents/tokipona-asset/manifests/releases/runtime-forest-visual-private-export.v0.1.json -Destination C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype/src/assets/runtime-forest-visual-private-export.v0.1.json -Force
pnpm --dir C:/Users/jiang/Documents/toki-pona/.worktrees/world-scale-prototype run assets:check
```

Expected: the gate reports `decision: "allow"` and `exported: true`; the public boundary verifies every copied hash.

- [ ] **Step 9: Commit each repository separately**

Private repo:

```powershell
git add -- source/art/production/forest-chapter/waterwheel-benchmark exports/runtime/forest-chapter/waterwheel-benchmark manifests/forest-chapter/waterwheel-benchmark.v001.yaml manifests/releases/runtime-forest-visual-private-export.v0.1.json scripts/forest
git commit -m "feat(assets): produce waterwheel visual benchmark pack"
```

Public repo:

```powershell
pnpm run assets:check
git add -- src/assets/runtime-forest-visual-private-export.v0.1.json public/assets/forest-chapter/waterwheel-benchmark/v0.1
git commit -m "feat(assets): admit approved waterwheel visual pack"
```

---

### Task 4: Replace Portrait Scale Profiles with a Responsive Full-Screen Viewport

**Files:**
- Create: `src/visual/world-viewport.ts`
- Create: `src/visual/world-viewport.test.ts`
- Modify: `src/visual/world-scale-prototype.ts`
- Modify: `src/visual/world-scale-prototype.test.ts`
- Modify: `src/visual/world-scale-controller.ts`
- Modify: `src/world-scale-main.test.ts`

**Interfaces:**
- Consumes: CSS viewport width and height plus the previous camera.
- Produces:

```ts
export interface WorldViewportProjection {
  readonly logicalWidth: number;
  readonly logicalHeight: 360;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly cssScale: number;
}

export function projectWorldViewport(cssWidth: number, cssHeight: number): WorldViewportProjection;
```

`projectWorldScaleFrame` becomes:

```ts
export function projectWorldScaleFrame(input: Readonly<{
  viewport: WorldViewportProjection;
  scene: RuntimeSceneManifest;
  runtime: RuntimeSnapshot;
  previousCamera: CameraState | null;
  previousCharacter: PrototypeCharacterHistory | null;
}>): WorldScaleFrame;
```

- [ ] **Step 1: Write failing viewport tests**

```ts
expect(projectWorldViewport(1920, 1080)).toMatchObject({
  logicalWidth: 640, logicalHeight: 360, cssScale: 3,
});
expect(projectWorldViewport(2560, 1080)).toMatchObject({
  logicalWidth: 854, logicalHeight: 360, cssScale: 3,
});
expect(projectWorldViewport(960, 540)).toMatchObject({
  logicalWidth: 640, logicalHeight: 360, cssScale: 1.5,
});
expect(projectWorldViewport(4000, 900).logicalWidth).toBe(960);
expect(() => projectWorldViewport(Number.NaN, 1080)).toThrow("viewport dimensions are invalid");
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
pnpm exec vitest run src/visual/world-viewport.test.ts src/visual/world-scale-prototype.test.ts src/world-scale-main.test.ts
```

Expected: FAIL because `world-viewport.ts` and the new signatures are absent.

- [ ] **Step 3: Implement viewport, 1 px detail, and dead-zone camera**

Rules:

```ts
const LOGICAL_HEIGHT = 360;
const MIN_LOGICAL_WIDTH = 640;
const MAX_LOGICAL_WIDTH = 960;
```

Clamp logical width to `[640, 960]`, round it to an even integer, and keep logical height exactly `360`. Set projected material cells to `size: 1` and generate positions on the `16×16` collision tile without changing collision rows.

The camera must preserve its prior position while the character center remains within normalized dead-zone bounds `{ left: 0.4, right: 0.6, top: 0.35, bottom: 0.7 }`. Outside the zone, move only enough to bring the character back to the boundary, apply at most `24` logical pixels of look-ahead in the facing direction, round to integer pixels, and clamp to world bounds.

- [ ] **Step 4: Replace legacy profile tests with viewport parity tests**

Prove that resizing changes only the frame projection:

```ts
const beforeSave = controller.toSave();
const narrow = controller.resize(1280, 720);
const wide = controller.resize(2560, 1080);
expect(narrow.frame.viewport.logicalHeight).toBe(360);
expect(wide.frame.viewport.logicalWidth).toBeGreaterThan(narrow.frame.viewport.logicalWidth);
expect(controller.toSave()).toEqual(beforeSave);
```

- [ ] **Step 5: Run and commit**

```powershell
pnpm exec vitest run src/visual/world-viewport.test.ts src/visual/world-scale-prototype.test.ts src/world-scale-main.test.ts
pnpm run typecheck
git add -- src/visual/world-viewport.ts src/visual/world-viewport.test.ts src/visual/world-scale-prototype.ts src/visual/world-scale-prototype.test.ts src/visual/world-scale-controller.ts src/world-scale-main.test.ts
git commit -m "feat(visual): add full-screen forest viewport"
```

---

### Task 5: Add an Audit-Only Waterwheel Movement Controller

**Files:**
- Create: `src/visual/waterwheel-visual-benchmark.ts`
- Create: `src/visual/waterwheel-visual-benchmark.test.ts`

**Interfaces:**
- Consumes: verified `scene.valley.waterwheel`, `waterwheel.from_settlement`, viewport dimensions, and semantic movement input.
- Produces:

```ts
export interface WaterwheelVisualBenchmarkSnapshot {
  readonly benchmarkKind: "visual_only";
  readonly sceneId: "scene.valley.waterwheel";
  readonly runtime: RuntimeSnapshot;
  readonly frame: WorldScaleFrame;
  readonly visualTimeTick: number;
}

export class WaterwheelVisualBenchmarkController {
  static fresh(cssWidth: number, cssHeight: number): WaterwheelVisualBenchmarkController;
  resize(cssWidth: number, cssHeight: number): WaterwheelVisualBenchmarkSnapshot;
  advanceTicks(ticks: number, input?: RuntimeInput): WaterwheelVisualBenchmarkSnapshot;
  snapshot(): WaterwheelVisualBenchmarkSnapshot;
}
```

- [ ] **Step 1: Write failing benchmark tests**

```ts
const target = WaterwheelVisualBenchmarkController.fresh(1920, 1080);
expect(target.snapshot()).toMatchObject({
  benchmarkKind: "visual_only",
  sceneId: "scene.valley.waterwheel",
});
const before = target.snapshot().runtime.player.position.x;
target.advanceTicks(30, { moveX: 1 });
expect(target.snapshot().runtime.player.position.x).toBeGreaterThan(before);
expect(JSON.stringify(target.snapshot())).not.toContain("receiptIndex");
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run src/visual/waterwheel-visual-benchmark.test.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the benchmark with the real fixed-step runtime**

Read `scene.valley.waterwheel` from the strict generated scene index. Convert its collision rows and entrances to a `SceneDefinition`, with `exits: []` so the art audit cannot accidentally transition or write chapter state. Instantiate `FixedStepRpgRuntime` at `waterwheel.from_settlement`, keep `globalProgress` as an empty frozen object, and project frames through Task 4.

The controller must not import `GameSession`, `commitSessionProposal`, adapters, WAL, or any task predicate. `visualTimeTick` increments with runtime ticks and is explicitly ephemeral.

- [ ] **Step 4: Add static boundary assertions**

```ts
const source = readFileSync("src/visual/waterwheel-visual-benchmark.ts", "utf8");
for (const forbidden of ["GameSession", "commitSessionProposal", "receipt", "world_flag", "WAL"])
  expect(source).not.toContain(forbidden);
```

- [ ] **Step 5: Run and commit**

```powershell
pnpm exec vitest run src/visual/waterwheel-visual-benchmark.test.ts src/runtime/runtime.test.ts
pnpm run typecheck
git add -- src/visual/waterwheel-visual-benchmark.ts src/visual/waterwheel-visual-benchmark.test.ts
git commit -m "feat(visual): add waterwheel art benchmark runtime"
```

---

### Task 6: Project the 48-Minute Day/Night Lighting and Remove Player Glow

**Files:**
- Create: `src/visual/forest-time-of-day.ts`
- Create: `src/visual/forest-time-of-day.test.ts`
- Modify: `src/visual/world-environment.ts`
- Modify: `src/visual/world-environment.test.ts`
- Modify: `src/visual/world-vfx.ts`
- Modify: `src/visual/world-vfx.test.ts`

**Interfaces:**
- Consumes: non-negative visual tick, reduced-motion preference, scene identity, and authored pack palette.
- Produces:

```ts
export type ForestDayPhase = "dawn" | "day" | "dusk" | "night";

export interface ForestTimeOfDayProjection {
  readonly phase: ForestDayPhase;
  readonly phaseProgress: number;
  readonly cycleProgress: number;
  readonly ambientColor: string;
  readonly fogColor: string;
  readonly skyTint: string;
  readonly localLightStrength: number;
}

export function projectForestTimeOfDay(visualTick: number): ForestTimeOfDayProjection;
```

- [ ] **Step 1: Write failing phase-boundary tests**

At 60 ticks per second, exact boundaries are `21_600`, `93_600`, `115_200`, and `172_800` ticks.

```ts
expect(projectForestTimeOfDay(0).phase).toBe("dawn");
expect(projectForestTimeOfDay(21_599).phase).toBe("dawn");
expect(projectForestTimeOfDay(21_600).phase).toBe("day");
expect(projectForestTimeOfDay(93_600).phase).toBe("dusk");
expect(projectForestTimeOfDay(115_200).phase).toBe("night");
expect(projectForestTimeOfDay(172_800)).toEqual(projectForestTimeOfDay(0));
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run src/visual/forest-time-of-day.test.ts src/visual/world-environment.test.ts src/visual/world-vfx.test.ts
```

Expected: FAIL because the time projection does not exist.

- [ ] **Step 3: Implement continuous time interpolation**

Parse only the approved `time-palette.v0.1.json` values. Interpolate ambient, fog, sky, and local-light strength within each phase; never interpolate material identity or collision. Reject non-finite, negative, or non-safe-integer ticks.

- [ ] **Step 4: Remove character light and cap decorative particles at 1 px**

Change `LightProjection["kind"]` to:

```ts
"authored_fixture" | "water_reflection" | "anomaly"
```

Delete the unconditional `player` light. Every mote and landing dust projection must have `size: 1`; authored local lights come from the visual pack or verified scene target identity, not the player position.

- [ ] **Step 5: Add explicit no-glow tests**

```ts
const vfx = projectWorldVfx(fixture());
expect(vfx.lights.every((light) => light.kind !== "player")).toBe(true);
expect(vfx.motes.every((mote) => mote.size === 1)).toBe(true);
expect(vfx.landingDust.every((dust) => dust.size === 1)).toBe(true);
```

- [ ] **Step 6: Run and commit**

```powershell
pnpm exec vitest run src/visual/forest-time-of-day.test.ts src/visual/world-environment.test.ts src/visual/world-vfx.test.ts
git add -- src/visual/forest-time-of-day.ts src/visual/forest-time-of-day.test.ts src/visual/world-environment.ts src/visual/world-environment.test.ts src/visual/world-vfx.ts src/visual/world-vfx.test.ts
git commit -m "feat(visual): add forest day night presentation"
```

---

### Task 7: Load the Approved Pack and Project Environment and Traveler Frames

**Files:**
- Create: `src/visual/forest-visual-pack.ts`
- Create: `src/visual/forest-visual-pack.test.ts`
- Modify: `src/visual/world-environment.ts`
- Modify: `src/visual/world-environment.test.ts`
- Modify: `src/visual/character-pixel-rig.ts`
- Modify: `src/visual/character-pixel-rig.test.ts`

**Interfaces:**
- Consumes: approved `RuntimeForestVisualAssetExport`, runtime pack JSON, time projection, scene, frame, character pose.
- Produces:

```ts
export interface ForestVisualPack {
  readonly packId: "forest.waterwheel.visual-benchmark.v001";
  readonly logicalView: Readonly<{ width: 640; height: 360 }>;
  readonly layers: readonly ForestVisualLayerDescriptor[];
  readonly materials: ForestMaterialAtlasDescriptor;
  readonly traveler: ForestTravelerAtlasDescriptor;
  readonly timePalette: ForestTimePalette;
}

export function readForestVisualPack(
  candidate: unknown,
  authority: RuntimeForestVisualAssetExport,
): ForestVisualPack;
```

`CharacterPixelRig` becomes an atlas projection:

```ts
export interface CharacterPixelRig {
  readonly animation: PrototypeCharacterAnimation;
  readonly frame: Readonly<{ x: number; y: number; width: 24; height: 24 }>;
  readonly facing: PrototypeCharacterFacing;
  readonly visualBounds: Readonly<{ width: 14; height: 20 }>;
  readonly anchorOffset: Readonly<{ x: -1; y: -6 }>;
  readonly collisionBody: Readonly<{ width: 12; height: 14 }>;
  readonly layerIds: readonly ["body", "hair", "clothes", "accessory"];
}
```

- [ ] **Step 1: Write failing strict-pack tests**

Reject unknown keys, wrong pack ID, incorrect logical view, wrong layer order, unapproved paths, duplicate frames, frames outside the atlas, traveler opaque bounds above 20 px, or a manifest digest that differs from the authority record.

- [ ] **Step 2: Write failing character tests**

```ts
expect(projectCharacterPixels(character("idle"), pack).visualBounds.height).toBe(20);
expect(projectCharacterPixels(character("run", "left"), pack).facing).toBe("left");
expect(projectCharacterPixels(character("fall"), pack).collisionBody).toEqual({ width: 12, height: 14 });
expect(JSON.stringify(projectCharacterPixels(character("idle"), pack)).toLowerCase())
  .not.toContain("glow");
```

- [ ] **Step 3: Run and verify failure**

```powershell
pnpm exec vitest run src/visual/forest-visual-pack.test.ts src/visual/character-pixel-rig.test.ts src/visual/world-environment.test.ts
```

- [ ] **Step 4: Implement strict pack and projections**

Environment layer order is fixed:

```ts
["background_far", "background_mid", "waterwheel_landmark", "interactive_world"]
```

Parallax factors are `[0.12, 0.35, 0.6, 1]`. The environment projection must carry image IDs and integer draw rectangles, never decoded image bytes or private paths. Character facing is rendered by destination transform; do not create a mirrored duplicate atlas.

- [ ] **Step 5: Run and commit**

```powershell
pnpm exec vitest run src/visual/forest-visual-pack.test.ts src/visual/character-pixel-rig.test.ts src/visual/world-environment.test.ts
pnpm run typecheck
git add -- src/visual/forest-visual-pack.ts src/visual/forest-visual-pack.test.ts src/visual/world-environment.ts src/visual/world-environment.test.ts src/visual/character-pixel-rig.ts src/visual/character-pixel-rig.test.ts
git commit -m "feat(visual): project reviewed forest art pack"
```

---

### Task 8: Compose the Full-Screen Canvas and Narrow Browser UI

**Files:**
- Create: `src/visual/world-canvas-renderer.ts`
- Create: `src/visual/world-canvas-renderer.test.ts`
- Modify: `src/visual/world-game-view.ts`
- Modify: `src/visual/world-game-view.test.ts`
- Modify: `src/world-scale-main.ts`
- Modify: `src/world-scale-main.test.ts`
- Modify: `src/world-scale.css`
- Modify: `world-scale.html`

**Interfaces:**
- Consumes: loaded public image bitmaps, `WaterwheelVisualBenchmarkSnapshot`, environment, character, VFX, time, and narrow UI view.
- Produces: pixels on one Canvas and semantic DOM commands only.

```ts
export interface WorldCanvasRenderInput {
  readonly frame: WorldScaleFrame;
  readonly environment: WorldEnvironmentProjection;
  readonly character: CharacterPixelRig;
  readonly vfx: WorldVfxProjection;
  readonly time: ForestTimeOfDayProjection;
  readonly images: ReadonlyMap<string, CanvasImageSource>;
}

export function renderWorldCanvas(
  context: CanvasRenderingContext2D,
  input: WorldCanvasRenderInput,
): void;
```

- [ ] **Step 1: Write failing render-order and boundary tests**

Use a recording Canvas context and assert this exact order:

```text
clear → far → mid → landmark → collision/material surface → water/VFX → traveler → local light/fog
```

Assert the renderer input and output never contain `session`, `save`, `receipt`, `flags`, `damage`, `worldVersion`, or private asset paths.

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run src/visual/world-canvas-renderer.test.ts src/visual/world-game-view.test.ts src/world-scale-main.test.ts
```

- [ ] **Step 3: Implement the renderer and image loader**

Set `context.imageSmoothingEnabled = false`. Draw all source rectangles on integer destinations. Use `globalCompositeOperation` only inside renderer-owned save/restore pairs. Night ambience dims the world layer but never applies a player halo.

- [ ] **Step 4: Replace the portrait laboratory DOM**

`world-scale-main.ts` must:

1. load the approved runtime pack from public paths;
2. instantiate `WaterwheelVisualBenchmarkController`;
3. call `resize(window.innerWidth, window.innerHeight)` through one requestAnimationFrame-throttled resize handler;
4. set canvas internal dimensions to the logical viewport and CSS dimensions to the full browser viewport;
5. preserve keyboard/touch movement and jump;
6. keep audit controls behind `V` or an accessible button;
7. expose audit-only dawn/day/dusk/night preview buttons without writing session state;
8. show an explicit loading/error status if the pack is absent or invalid; never fall back to a private path.

Remove the `WORLD_SCALE_PROFILE_IDS` buttons and the visible “当前/中等/大世界” profile chooser.

- [ ] **Step 5: Implement full-screen CSS**

Required rules:

```css
html, body, #world-scale-app, .world-review, .world-review__stage {
  width: 100%; height: 100%; margin: 0; overflow: hidden;
}
.world-review canvas {
  width: 100vw; height: 100vh; object-fit: fill;
  image-rendering: pixelated;
}
.world-review__audit[hidden] { display: none; }
```

Use `env(safe-area-inset-*)` for touch controls, `:focus-visible` for keyboard focus, and disable nonessential transitions under `prefers-reduced-motion`. Do not add a permanent right column.

- [ ] **Step 6: Run focused tests and commit**

```powershell
pnpm exec vitest run src/visual/world-canvas-renderer.test.ts src/visual/world-game-view.test.ts src/world-scale-main.test.ts
pnpm run typecheck
git add -- src/visual/world-canvas-renderer.ts src/visual/world-canvas-renderer.test.ts src/visual/world-game-view.ts src/visual/world-game-view.test.ts src/world-scale-main.ts src/world-scale-main.test.ts src/world-scale.css world-scale.html
git commit -m "feat(visual): render full-screen waterwheel benchmark"
```

---

### Task 9: Browser, Build, and User Visual Acceptance Gate

**Files:**
- Create: `e2e/world-scale.spec.ts`
- Modify only if the new entry changes measured closures: `scripts/build/bundle-budget.test.ts`
- Create outside Git: `.superpowers/brainstorm/forest-waterwheel-final-audit/*.png`

**Interfaces:**
- Consumes: built `world-scale.html` and approved public forest pack.
- Produces: repeatable desktop/mobile evidence and a user approval decision.

- [ ] **Step 1: Write the failing browser test**

```ts
test("fills the viewport and keeps the audit panel collapsed", async ({ page }) => {
  await page.goto("/world-scale.html");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#world-audit")).toBeHidden();
  const box = await page.locator("canvas").boundingBox();
  expect(box?.width).toBe(page.viewportSize()!.width);
  expect(box?.height).toBe(page.viewportSize()!.height);
});
```

Add cases for keyboard movement, `V` audit toggle, time-state preview, `prefers-reduced-motion`, and a `915×412` phone landscape viewport. Assert that no profile selector or permanent right panel exists.

- [ ] **Step 2: Run browser test and verify failure before final wiring**

```powershell
pnpm exec playwright test e2e/world-scale.spec.ts
```

Expected: FAIL until Task 8 wiring is complete.

- [ ] **Step 3: Capture deterministic audit evidence**

At `1920×1080`, capture dawn, day, dusk, and night after positioning the traveler beside the waterwheel. At `915×412`, capture one phone-landscape frame. Save them under the ignored `.superpowers/brainstorm/forest-waterwheel-final-audit/` directory; do not commit review images.

- [ ] **Step 4: Run the complete Node 22 verification gate**

```powershell
node --version
pnpm run content:check
pnpm run assets:check
pnpm run typecheck
pnpm exec vitest run src/assets/runtime-forest-visual-assets.test.ts scripts/assets/release-gate.test.ts scripts/assets/public-runtime-boundary.test.ts src/visual/world-viewport.test.ts src/visual/world-scale-prototype.test.ts src/visual/waterwheel-visual-benchmark.test.ts src/visual/forest-time-of-day.test.ts src/visual/forest-visual-pack.test.ts src/visual/world-environment.test.ts src/visual/character-pixel-rig.test.ts src/visual/world-vfx.test.ts src/visual/world-canvas-renderer.test.ts src/visual/world-game-view.test.ts src/world-scale-main.test.ts
pnpm run test
pnpm run build
pnpm exec playwright test e2e/world-scale.spec.ts
git diff --check
```

Expected:

- Node major version is `22`;
- all commands exit `0`;
- bundle budget stays within the existing gate;
- no private path or review media enters `dist` or `public`.

- [ ] **Step 5: Stop for final user visual acceptance**

Show the running full-screen page and five audit captures. Acceptance requires explicit approval of:

1. small traveler versus large environment scale;
2. forest/waterwheel art quality no longer reading as placeholder geometry;
3. no player glow and no oversized particles;
4. daylight, dawn, dusk, and night reuse without looking like simple recolors;
5. full-screen desktop and phone-landscape composition;
6. readable movement and foreground against all four time states.

If rejected, return to Task 3 for asset changes or Task 6–8 for presentation changes. Do not start the pixel-physics plan.

- [ ] **Step 6: Commit the acceptance test**

```powershell
git add -- e2e/world-scale.spec.ts scripts/build/bundle-budget.test.ts
git commit -m "test(visual): gate waterwheel benchmark presentation"
```

If `scripts/build/bundle-budget.test.ts` did not require a measured fixture update, do not stage it.

---

## Plan Completion Boundary

This plan is complete only when the user approves the running forest–waterwheel benchmark and all Node 22 gates pass. Completion authorizes writing the next plan for 1 px materials, water, finite reactions, gravity, destruction, persistence, and 30/60 fps deterministic simulation. It does not authorize implementing that physics plan implicitly.
