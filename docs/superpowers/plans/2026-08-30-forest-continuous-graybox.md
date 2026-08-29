# Forest Continuous Graybox Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the portrait, single-scene world-scale experiment with a full-screen, fixed-zoom `640×360` playable graybox of one continuous Chapter 1 forest while preserving all existing domain logic and saves.

**Architecture:** Add a strict generated `forestSpatial` content projection under the existing forest region authority, build a deterministic authored-skeleton/local-variation map, and run a dedicated fixed-step graybox runtime over lazily materialized `16×16` pixel chunks. A stateful camera and read-only spatial projection expose district/location facts without minting GameSession events. `world-scale.html` becomes the acceptance surface; `rpg.html` and all existing scene/domain flows remain unchanged until a later integration plan.

**Tech Stack:** TypeScript 7, Vitest, Vite, Canvas 2D, Playwright, YAML content compiler, generated strict runtime manifests.

---

## Global Constraints

- Work only in `C:\Users\jiang\Documents\toki-pona\.worktrees\world-scale-prototype` on branch `codex/world-scale-prototype`.
- Do not stage, delete, or edit `.superpowers/brainstorm/`.
- Do not modify or export the private v001–v003 concept art. This milestone renders original graybox primitives only.
- Do not modify `GameSession`, WAL, quest, learning, survival, economy, reputation, or trade outcomes.
- Do not replace existing N00–N07 IDs. They become spatial district IDs mapped to their existing scene IDs.
- Keep the authoritative gameplay collision body at `12×14` pixels. The future character sprite may be about `20` pixels tall, but visual height is not a collision change.
- The forest map is one continuous region. Do not create scene-transition triggers between its districts.
- Keep the logical viewport exactly `640×360`; browser presentation may crop the outer edge to fill unusual aspect ratios but may not stretch or auto-zoom.
- Keep material storage lazy: no eager `10,240×2,880` one-pixel array and no eager creation of all `115,200` chunks.
- Use test-driven development: add the failing test, run it and observe the intended failure, implement the minimum, then rerun.
- Use `apply_patch` for source edits. Run all commands from the worktree root.
- Commit after every task using the exact commit message listed below.

## File Structure

### New files

- `src/content/runtime-forest-spatial-manifest.ts` — strict, digest-verified runtime authority.
- `src/content/runtime-forest-spatial-manifest.test.ts` — strict-reader and tamper tests.
- `src/content/forest-continuous-map-content.test.ts` — source/compiler topology contract.
- `scripts/content/forest-spatial-runtime-artifact.ts` — generated projection from the canonical region YAML.
- `scripts/content/forest-spatial-runtime-artifact.test.ts` — projection/source mutation tests.
- `src/world/forest-region-generator.ts` — fixed macro skeleton, seeded local variation, and connectivity validation.
- `src/world/forest-region-generator.test.ts` — determinism, gate, ratio, and route tests.
- `src/world/forest-chunk-stream.ts` — lazy `16×16` material/collision chunks with a bounded cache.
- `src/world/forest-chunk-stream.test.ts` — chunk identity, visibility, and cache tests.
- `src/runtime/player-motion.ts` — shared fixed-step player motion over an injected collision query.
- `src/runtime/player-motion.test.ts` — parity and collision tests.
- `src/runtime/forest-camera.ts` — fixed zoom, dead zone, look-ahead, and vertical bias.
- `src/runtime/forest-camera.test.ts` — exact camera-behavior tests.
- `src/world/forest-graybox-runtime.ts` — continuous-region fixed-step runtime and recovery.
- `src/world/forest-graybox-runtime.test.ts` — movement, collision, deterministic replay, and recovery tests.
- `src/game/forest-spatial-projection.ts` — read-only coordinate-to-district/anchor authority projection.
- `src/game/forest-spatial-projection.test.ts` — district boundary and fail-closed tests.
- `src/visual/forest-graybox-controller.ts` — browser-facing audit controller with semantic movement only.
- `src/visual/forest-graybox-controller.test.ts` — controller parity and domain-nonmutation tests.
- `src/visual/forest-graybox-view.ts` — pure render-command projection for terrain, water, landmarks, and HUD.
- `src/visual/forest-graybox-view.test.ts` — frame-continuation and partial-landmark tests.
- `e2e/world-scale-graybox.spec.ts` — full-screen desktop/mobile traversal acceptance.

### Modified files

- `data/world/regions/valley-prologue.v0.1.yaml` — append the canonical `continuous_map_contract` without changing existing domain nodes/events.
- `src/content/compiler.ts` and `src/content/compiler.test.ts` — validate the new contract and cross-references.
- `scripts/content/runtime-artifact.ts` and `scripts/content/runtime-artifact.test.ts` — emit `forestSpatial`.
- `src/generated/content-runtime.v0.1.json` — regenerated artifact.
- `src/runtime/runtime.ts` and `src/runtime/runtime.test.ts` — delegate unchanged motion math to the shared motion step.
- `src/world-scale-main.ts` and `src/world-scale-main.test.ts` — switch the experiment page to the continuous controller.
- `src/world-scale.css` and `world-scale.html` — full-bleed landscape presentation and concise instructions.
- `docs/superpowers/specs/2026-08-30-forest-continuous-map-ecology-design.md` — add an implementation-status link only after acceptance tests pass.

## Canonical Spatial Contract

Append this shape to `data/world/regions/valley-prologue.v0.1.yaml`; values are authored facts, not browser overrides:

```yaml
continuous_map_contract:
  schema_version: "g01.forest-spatial.v0.1"
  runtime_origin: "top_left"
  region_bounds_px: {width: 10240, height: 2880}
  viewport_px: {width: 640, height: 360}
  viewport_envelope: {columns: 16, rows: 8}
  visible_material_cell_px: 1
  storage_chunk_px: {width: 16, height: 16}
  chapter_one_accessible_ratio: {minimum: 0.35, maximum: 0.40}
  camera:
    profile_id: "forest_side_scroll.v0.1"
    fixed_zoom: true
    movement_look_ahead_ratio: 0.18
    dead_zone_normalized: {left: 0.38, right: 0.62, top: 0.35, bottom: 0.67}
    downward_bias_ratio: 0.14
    upward_lag_ratio: 0.08
    pixel_snap: true
  anchors:
    - {anchor_id: "forest.arrival", scene_id: "scene.valley.arrival_shelf", position_px: [512, 480]}
    - {anchor_id: "forest.stream", scene_id: "scene.valley.stream_section", position_px: [1664, 704]}
    - {anchor_id: "forest.settlement", scene_id: "scene.valley.settlement", position_px: [3072, 672]}
    - {anchor_id: "forest.hermit_branch", scene_id: "scene.valley.stream_section", position_px: [4032, 992]}
    - {anchor_id: "forest.waterwheel", scene_id: "scene.valley.waterwheel", position_px: [5312, 1488]}
    - {anchor_id: "forest.cistern", scene_id: "scene.valley.high_cistern", position_px: [6560, 1056]}
    - {anchor_id: "forest.den_bypass", scene_id: "scene.valley.den_bypass", position_px: [6176, 1792]}
    - {anchor_id: "forest.return_channel", scene_id: "scene.valley.return_channel", position_px: [7488, 1744]}
    - {anchor_id: "forest.underground_node", scene_id: "scene.valley.underground_order_node", position_px: [8704, 2016]}
    - {anchor_id: "forest.safe_range", scene_id: "scene.valley.safe_range", position_px: [3360, 192]}
    - {anchor_id: "forest.old_mine", scene_id: "scene.valley.old_mine_threshold", position_px: [9248, 2208]}
  chapter_one_route_anchor_ids:
    [forest.arrival, forest.stream, forest.settlement, forest.hermit_branch,
     forest.waterwheel, forest.cistern, forest.return_channel,
     forest.underground_node, forest.settlement]
  later_gate_anchor_ids: [forest.safe_range, forest.old_mine]
  districts:
    - {district_id: "forest.arrival", scene_id: "scene.valley.arrival_shelf", bounds_px: [0, 256, 1280, 640]}
    - {district_id: "forest.stream", scene_id: "scene.valley.stream_section", bounds_px: [1280, 448, 1216, 768]}
    - {district_id: "forest.settlement", scene_id: "scene.valley.settlement", bounds_px: [2496, 384, 1280, 640]}
    - {district_id: "forest.hermit_branch", scene_id: "scene.valley.stream_section", bounds_px: [3776, 768, 768, 640]}
    - {district_id: "forest.waterwheel", scene_id: "scene.valley.waterwheel", bounds_px: [4544, 1024, 1536, 960]}
    - {district_id: "forest.cistern", scene_id: "scene.valley.high_cistern", bounds_px: [6080, 640, 960, 768]}
    - {district_id: "forest.den_bypass", scene_id: "scene.valley.den_bypass", bounds_px: [6080, 1472, 960, 640]}
    - {district_id: "forest.return_channel", scene_id: "scene.valley.return_channel", bounds_px: [7040, 1408, 1152, 704]}
    - {district_id: "forest.underground_node", scene_id: "scene.valley.underground_order_node", bounds_px: [8192, 1728, 896, 704]}
    - {district_id: "forest.safe_range", scene_id: "scene.valley.safe_range", bounds_px: [3072, 32, 640, 320]}
    - {district_id: "forest.old_mine", scene_id: "scene.valley.old_mine_threshold", bounds_px: [9088, 1888, 1024, 640]}
  route_edges:
    - {edge_id: "arrival.stream", from: "forest.arrival", to: "forest.stream", capability: null}
    - {edge_id: "stream.settlement", from: "forest.stream", to: "forest.settlement", capability: null}
    - {edge_id: "settlement.hermit", from: "forest.settlement", to: "forest.hermit_branch", capability: null}
    - {edge_id: "hermit.waterwheel", from: "forest.hermit_branch", to: "forest.waterwheel", capability: null}
    - {edge_id: "waterwheel.cistern", from: "forest.waterwheel", to: "forest.cistern", capability: "maintenance_access_open"}
    - {edge_id: "waterwheel.den", from: "forest.waterwheel", to: "forest.den_bypass", capability: null}
    - {edge_id: "den.cistern", from: "forest.den_bypass", to: "forest.cistern", capability: "den_route_open"}
    - {edge_id: "cistern.return", from: "forest.cistern", to: "forest.return_channel", capability: "exit_ladder_lowered"}
    - {edge_id: "return.underground", from: "forest.return_channel", to: "forest.underground_node", capability: "settlement_supply_stable"}
    - {edge_id: "underground.settlement", from: "forest.underground_node", to: "forest.settlement", capability: "forest_chapter_epilogue_committed"}
    - {edge_id: "settlement.safe_range", from: "forest.settlement", to: "forest.safe_range", capability: "range_trial_permission"}
    - {edge_id: "settlement.old_mine", from: "forest.settlement", to: "forest.old_mine", capability: "forest_chapter_epilogue_committed"}
  meadow_ground_band_px: {left: 2496, right: 3776, y: 704, maximum_vertical_delta: 16}
  water_course_control_points_px:
    [[1088, 672], [1792, 800], [3328, 752], [4352, 1120], [5184, 1504], [7424, 1792]]
  landmarks:
    - {landmark_id: "forest.waterwheel_structure", district_id: "forest.waterwheel", bounds_px: [4800, 1120, 1408, 1024], reveal_stage_ids: [channel_sound, support_beams, broken_rim, inner_machinery]}
  encounter_chambers:
    - {chamber_id: "forest.stream.bend", district_id: "forest.stream", escape_edge_ids: [arrival.stream, stream.settlement]}
    - {chamber_id: "forest.waterwheel.approach", district_id: "forest.waterwheel", escape_edge_ids: [hermit.waterwheel, waterwheel.den]}
    - {chamber_id: "forest.return.lower", district_id: "forest.return_channel", escape_edge_ids: [cistern.return, return.underground]}
```

The projector must copy and normalize these authored district rectangles, route edges, landmark bounds, meadow ground band, water-course control points, encounter chambers, and capability gates into the generated artifact. It must not invent production geometry in TypeScript. All projected fields are included in `sourceDigest`.

## Required Interfaces

```ts
export interface RuntimeForestSpatialManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly profileId: "forest_side_scroll.v0.1";
  readonly regionBoundsPx: Readonly<{ width: 10240; height: 2880 }>;
  readonly viewportPx: Readonly<{ width: 640; height: 360 }>;
  readonly storageChunkPx: Readonly<{ width: 16; height: 16 }>;
  readonly visibleMaterialCellPx: 1;
  readonly chapterOneAccessibleRatio: Readonly<{ minimum: 0.35; maximum: 0.40 }>;
  readonly camera: RuntimeForestCameraContract;
  readonly anchors: readonly RuntimeForestAnchor[];
  readonly districts: readonly RuntimeForestDistrict[];
  readonly routeEdges: readonly RuntimeForestRouteEdge[];
  readonly landmarks: readonly RuntimeForestLandmark[];
}

export function readRuntimeForestSpatialManifest(candidate: unknown): RuntimeForestSpatialManifest;
export function isVerifiedRuntimeForestSpatialManifest(value: unknown): value is RuntimeForestSpatialManifest;
```

```ts
export interface ForestRegionBuild {
  readonly seed: string;
  readonly topologyDigest: `sha256:${string}`;
  readonly anchors: readonly ForestAnchor[];
  readonly routeEdges: readonly ForestRouteEdge[];
  readonly localPockets: readonly ForestLocalPocket[];
  readonly laterGates: readonly ForestCapabilityGate[];
  materialAt(x: number, y: number): ForestMaterial;
  isSolid(bounds: Aabb): boolean;
}

export function generateForestRegion(
  manifest: RuntimeForestSpatialManifest,
  seed: string,
): ForestRegionBuild;
```

```ts
export interface ForestCameraState extends CameraState {
  readonly facing: "left" | "right";
}

export function advanceForestCamera(
  contract: RuntimeForestCameraContract,
  previous: ForestCameraState,
  player: PlayerState,
  regionBounds: Readonly<{ width: number; height: number }>,
): ForestCameraState;
```

```ts
export interface ForestSpatialLocation {
  readonly districtId: string;
  readonly sceneId: string;
  readonly position: Vec2;
  readonly tick: number;
  readonly nearbyAnchorIds: readonly string[];
}

export function projectForestSpatialLocation(
  manifest: RuntimeForestSpatialManifest,
  runtime: ForestGrayboxSnapshot,
): ForestSpatialLocation;
```

## Task 1: Add the Strict Continuous-Forest Content Authority

**Files:**
- Modify: `data/world/regions/valley-prologue.v0.1.yaml`
- Modify: `src/content/compiler.ts`
- Modify: `src/content/compiler.test.ts`
- Create: `src/content/forest-continuous-map-content.test.ts`
- Create: `scripts/content/forest-spatial-runtime-artifact.ts`
- Create: `scripts/content/forest-spatial-runtime-artifact.test.ts`
- Create: `src/content/runtime-forest-spatial-manifest.ts`
- Create: `src/content/runtime-forest-spatial-manifest.test.ts`
- Modify: `scripts/content/runtime-artifact.ts`
- Modify: `scripts/content/runtime-artifact.test.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

### Step 1: Write failing source-contract tests

Assert all of the following in `forest-continuous-map-content.test.ts`:

- the bounds are exactly `10,240×2,880` and equal `16×8` fixed viewports;
- visible cell is `1` pixel and storage chunk is `16×16` pixels;
- camera profile, dead zone, look-ahead `0.18`, vertical bias, fixed zoom, and pixel snap are exact;
- every authored anchor is finite, inside the region, has a unique ID, and references an existing forest scene;
- the main route has the exact order above, including the return to settlement;
- later-gate anchors are excluded from initial accessibility;
- settlement anchor is inside the authored level meadow band;
- waterwheel bounds are larger than a viewport and intersect at least two camera crops;
- ordinary encounter chambers expose at least two distinct escape edges.

Run:

```powershell
pnpm exec vitest run src/content/forest-continuous-map-content.test.ts
```

Expected: FAIL because `continuous_map_contract` does not exist.

### Step 2: Add the canonical YAML and compiler validation

Implement a dedicated `validateForestContinuousMapContract()` called only for canonical `valley_prologue`. Reject missing/unknown fields, duplicate anchors, non-finite values, incorrect ratios, mismatched scene IDs, out-of-bounds geometry, a raised settlement meadow, a one-escape encounter chamber, and camera drift from the approved values.

Run the same test; expected: PASS.

### Step 3: Write failing projector and strict-reader tests

Test that `projectForestSpatialRuntimeManifest()` emits a deterministic body and `readRuntimeForestSpatialManifest()` rejects:

- changed bounds, camera values, anchor order, scene mapping, route order, or gate list;
- a forged but format-valid source digest;
- unknown outer or nested fields;
- duplicate district, edge, anchor, or landmark IDs;
- landmark bounds smaller than one viewport;
- a stale generated artifact.

Run:

```powershell
pnpm exec vitest run scripts/content/forest-spatial-runtime-artifact.test.ts src/content/runtime-forest-spatial-manifest.test.ts
```

Expected: FAIL because the projector/reader do not exist.

### Step 4: Implement projection and wire the artifact

Project `forestSpatial` as a new top-level `RuntimeContentArtifact` field. Recompute its digest from the full body, deep-freeze the cloned result, and brand only reader-returned objects in a module-private `WeakSet`.

Run:

```powershell
pnpm run content:generate
pnpm exec vitest run src/content/forest-continuous-map-content.test.ts scripts/content/forest-spatial-runtime-artifact.test.ts src/content/runtime-forest-spatial-manifest.test.ts scripts/content/runtime-artifact.test.ts
pnpm run content:check
pnpm run typecheck
```

Expected: all PASS.

### Step 5: Commit

```powershell
git add data/world/regions/valley-prologue.v0.1.yaml src/content/compiler.ts src/content/compiler.test.ts src/content/forest-continuous-map-content.test.ts scripts/content/forest-spatial-runtime-artifact.ts scripts/content/forest-spatial-runtime-artifact.test.ts src/content/runtime-forest-spatial-manifest.ts src/content/runtime-forest-spatial-manifest.test.ts scripts/content/runtime-artifact.ts scripts/content/runtime-artifact.test.ts src/generated/content-runtime.v0.1.json
git commit -m "feat(content): author continuous forest space"
```

## Task 2: Generate the Deterministic Macro Skeleton and Local Pockets

**Files:**
- Create: `src/world/forest-region-generator.ts`
- Create: `src/world/forest-region-generator.test.ts`

### Step 1: Write failing generator tests

Use the verified generated manifest. Assert:

```ts
const first = generateForestRegion(manifest, "forest.chapter-one.audit");
const second = generateForestRegion(manifest, "forest.chapter-one.audit");
expect(serializeForestRegion(first)).toBe(serializeForestRegion(second));
expect(first.topologyDigest).toBe(second.topologyDigest);
```

For 32 fixed seeds, assert:

- every main-route anchor is connected in order;
- initial capability BFS reaches between `35%` and `40%` of full traversable cells;
- `safe_range` and `old_mine` remain visible but unreachable;
- no generated pocket overlaps a story anchor, checkpoint clearance, settlement structure zone, or waterwheel protected mass;
- each ordinary encounter chamber has two graph-distinct escape routes;
- the meadow surface stays within one 16-pixel macro-tile of its authored level;
- no critical-route clearance is narrower than the `12×14` body plus a 2-pixel margin.

Run:

```powershell
pnpm exec vitest run src/world/forest-region-generator.test.ts
```

Expected: FAIL because the generator does not exist.

### Step 2: Implement fixed skeleton first

Build authored terrain primitives for:

- surface arrival ledge;
- shallow stream descent;
- flat meadow settlement clearing;
- hermit side branch;
- descending ravine;
- multi-screen protected waterwheel mass;
- upper cistern route;
- return channel and lower shortcut;
- sealed safe-range, old-mine, and deep-root gates.

Use runtime top-left coordinates throughout. Do not convert between coordinate systems outside the content projector.

### Step 3: Add seeded local variation

Derive a deterministic 32-bit generator seed from `sha256Canonical({ manifestDigest, seed })`. Variation may add only non-critical pockets, loose materials, roots, ledges, and resource candidate markers. If validation fails, throw `ForestGenerationError` with the seed and failed invariant; never teleport, carve the critical path after the fact, or remove a gate.

### Step 4: Verify and commit

```powershell
pnpm exec vitest run src/world/forest-region-generator.test.ts
pnpm run typecheck
git add src/world/forest-region-generator.ts src/world/forest-region-generator.test.ts
git commit -m "feat(world): generate continuous forest topology"
```

## Task 3: Add Lazy Material Chunks and Shared Fixed-Step Motion

**Files:**
- Create: `src/world/forest-chunk-stream.ts`
- Create: `src/world/forest-chunk-stream.test.ts`
- Create: `src/runtime/player-motion.ts`
- Create: `src/runtime/player-motion.test.ts`
- Modify: `src/runtime/runtime.ts`
- Modify: `src/runtime/runtime.test.ts`
- Create: `src/world/forest-graybox-runtime.ts`
- Create: `src/world/forest-graybox-runtime.test.ts`

### Step 1: Write failing chunk-stream tests

Define:

```ts
export interface ForestMaterialChunk {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly digest: `sha256:${string}`;
  readonly materials: Uint8Array; // exactly 256 one-pixel material cells
}

export class ForestChunkStream {
  visible(camera: CameraState, marginChunks?: number): readonly ForestMaterialChunk[];
  materialAt(x: number, y: number): ForestMaterial;
  isSolid(bounds: Aabb): boolean;
  cacheStats(): Readonly<{ materialized: number; retained: number }>;
}
```

Assert exact chunk dimensions, byte-stable digests, boundary queries, negative/out-of-bounds solidity, one-chunk visible margin, and bounded LRU retention. After traversing the full Chapter 1 route, `materialized` must remain well below `115,200`, and `retained` must not exceed the configured cap.

Run the focused test and observe the missing-module failure.

### Step 2: Implement lazy chunks

Material IDs for this milestone are only `air`, `protected_mass`, `soil`, `wet_soil`, `stone`, `wood`, `metal`, `water`, and `vegetation`. Generate each chunk from immutable topology primitives plus the seed; cache the 256-byte payload and digest. Use continuous bounds queries for collision so no full-region bitmap is allocated.

### Step 3: Extract and parity-test player motion

Move the existing acceleration, deceleration, gravity, maximum-fall-speed, jump, and axis stepping math into `player-motion.ts`. Inject only a collision predicate. Keep constants byte-for-byte equivalent to the old runtime:

```ts
export const PLAYER_MOTION = Object.freeze({
  moveSpeed: 88,
  groundAcceleration: 720,
  airAcceleration: 420,
  groundDeceleration: 920,
  gravity: 560,
  maxFallSpeed: 240,
  jumpSpeed: 190,
});
```

Add a parity test that feeds identical 600-tick input sequences to the pre-refactor expectation fixture and `FixedStepRpgRuntime`. Existing runtime snapshots and replay signatures must remain unchanged.

### Step 4: Implement `ForestGrayboxRuntime`

The runtime owns tick, body state, previous jump, seed, checkpoint, chunk stream, and camera input state. It exposes semantic `advanceTicks(ticks, RuntimeInput)`, `snapshot()`, `setCheckpoint()`, and `resetToCheckpoint()`. It does not own GameSession or emit domain events.

Test:

- 30/60-render-fps accumulator schedules produce identical fixed-tick snapshots;
- solid terrain, protected waterwheel mass, and sealed gates collide;
- water is non-solid in graybox but reported as material;
- checkpoints reject solid/no-recovery positions;
- reset never teleports across a capability gate;
- recorded inputs replay to the same topology/player/camera digest.

### Step 5: Verify and commit

```powershell
pnpm exec vitest run src/world/forest-chunk-stream.test.ts src/runtime/player-motion.test.ts src/runtime/runtime.test.ts src/world/forest-graybox-runtime.test.ts
pnpm run typecheck
git add src/world/forest-chunk-stream.ts src/world/forest-chunk-stream.test.ts src/runtime/player-motion.ts src/runtime/player-motion.test.ts src/runtime/runtime.ts src/runtime/runtime.test.ts src/world/forest-graybox-runtime.ts src/world/forest-graybox-runtime.test.ts
git commit -m "feat(runtime): stream forest collision chunks"
```

## Task 4: Implement the Fixed-Zoom Forest Camera

**Files:**
- Create: `src/runtime/forest-camera.ts`
- Create: `src/runtime/forest-camera.test.ts`
- Modify: `src/world/forest-graybox-runtime.ts`
- Modify: `src/world/forest-graybox-runtime.test.ts`

### Step 1: Write failing camera tests

Assert:

- width/height remain exactly `640×360` for every player position;
- standing inside the dead zone does not move the camera;
- sustained right movement converges to a `115.2`-pixel (`640×0.18`) right look-ahead before pixel snap;
- facing reversal moves look-ahead only through the state transition, never a zoom or instant landmark reveal;
- descent biases down by `50.4` pixels (`360×0.14`);
- upward pursuit lags by `28.8` pixels (`360×0.08`);
- all results are integer pixel-snapped and clamped to `10,240×2,880`;
- save/load persists player, facing, and camera state and restores the exact camera without a one-frame jump.

Run the focused test and observe failure.

### Step 2: Implement the stateful camera

The camera consumes only verified contract values. No landmark may change zoom. Do not reuse `portrait-camera.ts`, whose scene-clamped portrait contract remains authoritative for the existing `rpg.html` flow.

### Step 3: Integrate and verify

```powershell
pnpm exec vitest run src/runtime/forest-camera.test.ts src/world/forest-graybox-runtime.test.ts
pnpm run typecheck
git add src/runtime/forest-camera.ts src/runtime/forest-camera.test.ts src/world/forest-graybox-runtime.ts src/world/forest-graybox-runtime.test.ts
git commit -m "feat(camera): follow continuous forest at fixed zoom"
```

## Task 5: Add Read-Only Spatial Projection and the Audit Controller

**Files:**
- Create: `src/game/forest-spatial-projection.ts`
- Create: `src/game/forest-spatial-projection.test.ts`
- Create: `src/visual/forest-graybox-controller.ts`
- Create: `src/visual/forest-graybox-controller.test.ts`
- Modify: `src/world-scale-main.test.ts`

### Step 1: Write failing spatial-projection tests

Use authoritative runtime coordinates and assert exact mappings to existing scene IDs. Boundary points that belong to zero or multiple districts must fail closed. Nearby anchors must be derived from authored positions and a fixed distance, never supplied by a caller.

Also assert the projection contains only:

```ts
type ForestSpatialLocation = {
  districtId: string;
  sceneId: string;
  position: Vec2;
  tick: number;
  nearbyAnchorIds: readonly string[];
};
```

It must not expose or accept quest flags, learning evidence, MP, inventory, damage, prices, receipts, or mutation commands.

### Step 2: Implement the controller

`ForestGrayboxController.fresh({ seed })` reads only a verified `forestSpatial` manifest, creates the generated region/runtime, and accepts `RuntimeInput`. Its snapshot contains runtime, location, streamed chunks, and graybox diagnostics. Keep seed reset explicit and deterministic.

### Step 3: Prove domain nonmutation

In the controller test, create a real `PrologueFlowSession`, retain its save, traverse the graybox from arrival through settlement and toward the waterwheel, and assert the Flow save is byte-identical because this audit milestone has no semantic interaction bridge yet. This is intentional: wiring trusted location into GameSession is a separate post-graybox plan after the user accepts the map.

### Step 4: Verify and commit

```powershell
pnpm exec vitest run src/game/forest-spatial-projection.test.ts src/visual/forest-graybox-controller.test.ts src/world-scale-main.test.ts
pnpm run typecheck
git add src/game/forest-spatial-projection.ts src/game/forest-spatial-projection.test.ts src/visual/forest-graybox-controller.ts src/visual/forest-graybox-controller.test.ts src/world-scale-main.test.ts
git commit -m "feat(game): project forest districts from world space"
```

## Task 6: Replace the Portrait Audit Page with the Full-Screen Graybox

**Files:**
- Create: `src/visual/forest-graybox-view.ts`
- Create: `src/visual/forest-graybox-view.test.ts`
- Modify: `src/world-scale-main.ts`
- Modify: `src/world-scale.css`
- Modify: `world-scale.html`
- Modify: `src/world-scale-main.test.ts`

### Step 1: Write failing pure-view tests

Project render commands from a controller snapshot and assert:

- canvas dimensions are exactly `640×360`;
- terrain intersects all appropriate viewport edges instead of forming a centered diorama;
- the settlement reads as a level meadow band;
- the waterwheel landmark is larger than the viewport and only a subset of its components is visible from each approach camera;
- no command renders player glow;
- the `12×14` collision body is not used as the future visual sprite-size contract;
- HUD data is limited to district label, movement help, seed, tick, and an audit reset action.

### Step 2: Implement primitive graybox rendering

Render back to front:

1. dark regional color field;
2. sparse root/rock silhouettes that clip at viewport edges;
3. protected structural mass;
4. streamed one-pixel material chunks;
5. water course and partial waterwheel components;
6. a small non-glowing placeholder traveler;
7. narrow semantic HUD and touch controls.

Use a single `ImageData` upload for streamed material pixels per frame, then draw authored landmark primitives. Do not use the private concept PNGs.

### Step 3: Make presentation full-bleed without stretching

Set the canvas backing store to `640×360`. For browser presentation, center a 16:9 surface with cover sizing:

```css
.forest-graybox canvas {
  width: max(100vw, calc(100vh * 16 / 9));
  height: max(100vh, calc(100vw * 9 / 16));
  image-rendering: pixelated;
}
```

The stage clips overflow, so desktop and portrait mobile fill the screen without stretching. Remove scale-profile buttons and the right audit drawer. Preserve accessible keyboard/touch labels and reduced-motion handling.

### Step 4: Verify and commit

```powershell
pnpm exec vitest run src/visual/forest-graybox-view.test.ts src/visual/forest-graybox-controller.test.ts src/world-scale-main.test.ts
pnpm run typecheck
pnpm run build
git add src/visual/forest-graybox-view.ts src/visual/forest-graybox-view.test.ts src/world-scale-main.ts src/world-scale.css world-scale.html src/world-scale-main.test.ts
git commit -m "feat(visual): render full-screen forest graybox"
```

## Task 7: Add Browser Traversal Acceptance and Close the Milestone

**Files:**
- Create: `e2e/world-scale-graybox.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-30-forest-continuous-map-ecology-design.md`

### Step 1: Write failing Playwright acceptance

Add desktop `1440×900` and mobile `390×844` cases. Assert:

- no audit sidebar or scale buttons exist;
- canvas backing size is `640×360` and its CSS box covers the viewport;
- keyboard and touch both move the same fixed-step player;
- the player can traverse arrival → stream → meadow settlement → hermit branch → waterwheel approach without a scene load;
- `data-district-id` changes while one runtime region ID remains stable;
- camera size never changes and the waterwheel is never fully visible at once;
- later gates remain blocked;
- reset restores the last safe graybox checkpoint without changing any RPG local-storage keys;
- no page errors occur.

Run:

```powershell
pnpm run build
pnpm exec playwright test e2e/world-scale-graybox.spec.ts
```

Expected before final wiring: FAIL at the first missing browser contract.

### Step 2: Complete only acceptance fixes

Fix selector, input, resize, or checkpoint defects exposed by the test. Do not add ecology, final sprites, magic creatures, weather, or GameSession domain writes here.

### Step 3: Run the complete release evidence

```powershell
pnpm run content:check
pnpm run typecheck
pnpm exec vitest run src/content/forest-continuous-map-content.test.ts scripts/content/forest-spatial-runtime-artifact.test.ts src/content/runtime-forest-spatial-manifest.test.ts src/world/forest-region-generator.test.ts src/world/forest-chunk-stream.test.ts src/runtime/player-motion.test.ts src/runtime/forest-camera.test.ts src/world/forest-graybox-runtime.test.ts src/game/forest-spatial-projection.test.ts src/visual/forest-graybox-controller.test.ts src/visual/forest-graybox-view.test.ts src/world-scale-main.test.ts
pnpm test
pnpm run build
pnpm exec playwright test e2e/world-scale-graybox.spec.ts
git diff --check
```

All commands must pass on repository-supported Node 22. A Node 24-only pass is not acceptable evidence.

### Step 4: Update status and commit

Add a short implementation-status section to the approved design spec containing:

- the accepted seed;
- topology digest;
- exact accessible ratio;
- browser audit URLs;
- automated gate results;
- explicit note that ecology and final art remain unimplemented.

```powershell
git add e2e/world-scale-graybox.spec.ts docs/superpowers/specs/2026-08-30-forest-continuous-map-ecology-design.md
git commit -m "test(world): gate continuous forest graybox"
```

## User Audit Gate

After Task 7, start the Vite server and give the user a clickable `world-scale.html` URL. Stop before ecology or runtime art. The user audits:

- full-screen composition;
- small-character/large-world relationship;
- surface-to-ravine route rhythm;
- settlement meadow placement;
- partial waterwheel discovery;
- camera dead zone/look-ahead;
- whether the environment reads as one connected place rather than a series of rooms.

Any rejected composition changes return to Tasks 1–6. Ecology and final art planning begin only after this gate is accepted.
