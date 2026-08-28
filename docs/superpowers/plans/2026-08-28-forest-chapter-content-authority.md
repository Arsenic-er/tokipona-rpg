# Forest Chapter Content Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete prologue content contract with a compiled, digest-bound runtime authority for the approved three-hour forest chapter, its 7+2 topology, medium/shard/hermit initiation, large-creature crisis, underground node, and three-way water allocation.

**Architecture:** Author all narrative and topology facts in YAML, reject drift in `compileContent`, and project only typed semantic fields into a new `RuntimeForestChapterManifest`. Existing gameplay systems remain intact during this phase; later plans will make `PrologueFlow`, ecology runtime, UI, and art consume this authority.

**Tech Stack:** TypeScript 5, Vitest, YAML content sources, repository content compiler, SHA-256 canonical runtime projections, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-28-forest-chapter-design.md`

## Global Constraints

- Supported Node.js version is `>=22.13 <23`; verification must run on Node 22 even if a local Node 24 installation can execute the commands.
- The first-play mainline target median is exactly `180` content-active minutes; accepted normal range is `[150, 240]`.
- Main topology is exactly seven scenes: arrival shelf, stream road, settlement, waterwheel gorge, high cistern, return wetland, underground order node.
- Optional topology is exactly den cave and safe range; old mine threshold is a post-chapter boundary and service channel is a waterwheel subarea.
- N00/N01 cannot provide active spell use or a usable medium.
- The first active words are exactly `telo`, `tawa`, `lili`, `suli`, `wawa`; no segment focuses more than two new words.
- Mandatory kills and mandatory wildlife-product requirements remain `0`.
- Tool/non-magic mainline routes remain valid and never create false language evidence.
- The medium frame and forest site shard are distinct; the shard cannot grant word meaning, MP, or automatic casting.
- Runtime code reads generated typed projections only; it does not parse YAML, raw predicate strings, or free-form narrative text.
- Every new runtime projection has exact-key validation, a recomputed SHA-256 digest, deep freezing, and tamper/resign negative tests.
- This plan does not implement final UI, art, player animation, full story reducers, or browser E2E. Those are separate plans after this authority is green.

## Plan Decomposition

This specification spans independent deliverables and therefore uses separate plans:

1. **This plan — content authority:** canonical YAML, compiler, generated projection, strict reader, content gates.
2. **Runtime chapter plan:** `GameSession` events, trusted adapters, `PrologueFlow`, hermit initiation, shard synchronization, allocation reducers, save/replay.
3. **Ecology and consequence plan:** large-creature behavior, den/young state, three allocation consequence projections, economy/reputation integration.
4. **Presentation plan:** full-screen N00/N02 vertical slice, neutral player animation, formal HUD/panels, private-asset export gates.
5. **Acceptance plan:** three-hour telemetry, branch/reload/crash E2E, Windows input, visual and accessibility review.

---

### Task 1: Author and validate the medium, shard, and hermit initiation contract

**Files:**
- Create: `data/tasks/ch01-medium-hermit-initiation.v0.1.yaml`
- Create: `src/content/forest-medium-content.test.ts`
- Modify: `data/scenes/valley-waterwheel.v0.1.yaml`
- Modify: `data/scenes/valley-stream-section.v0.1.yaml`
- Modify: `data/scenes/valley-settlement.v0.1.yaml`
- Modify: `data/world/regions/valley-prologue.v0.1.yaml`
- Modify: `src/content/compiler.ts` (`validateSource`, new `validateForestMediumTaskSource`, new reference validator)

**Interfaces:**
- Consumes: existing scene/task indexes and the `waterwheel_goal_committed` event contract.
- Produces: task ID `ch01_medium_hermit_initiation`; medium ID `artifact.ancient_medium_frame`; shard ID `artifact.fragment.forest_site`; independent events `forest_medium_discovered`, `forest_medium_disclosure_committed`, `forest_hermit_route_committed`, `forest_telo_initiation_committed`.

- [ ] **Step 1: Write compiler tests for the complete initiation sequence**

Create `src/content/forest-medium-content.test.ts` using the repository-source loader pattern from `src/content/cistern-content.test.ts`. Assert the valid source exposes the exact sequence and three discovery routes:

```ts
it("locks medium discovery, hermit routes, and safe telo initiation", () => {
  const manifest = compileContent(repositorySources());
  const task = manifest.indexes.tasks.ch01_medium_hermit_initiation!;
  expect(task.required_event_sequence).toEqual([
    "waterwheel_goal_committed",
    "forest_medium_discovered",
    "forest_hermit_route_committed",
    "forest_telo_initiation_committed",
  ]);
  expect((task.hermit_routes as readonly { route_id: string }[]).map(({ route_id }) => route_id)).toEqual([
    "medium.tell_facility_worker",
    "medium.follow_fragment_markers",
    "medium.ask_external_trader",
  ]);
  expect(task.automatic_word_mastery_forbidden).toBe(true);
  expect(task.automatic_mp_increase_forbidden).toBe(true);
});
```

Add negative cases that mutate route order, move the hermit authority away from `scene.valley.stream_section`, remove the natural-water observation, or set either automatic grant flag to `false`; each must throw `ContentValidationError` containing `task.forest_medium_contract`.

- [ ] **Step 2: Run the focused test and verify the source is absent**

Run:

```powershell
pnpm exec vitest run src/content/forest-medium-content.test.ts
```

Expected: FAIL because `ch01_medium_hermit_initiation` is not indexed.

- [ ] **Step 3: Author the exact task contract**

Create `data/tasks/ch01-medium-hermit-initiation.v0.1.yaml` with this semantic core:

```yaml
schema_version: "g01.task.infrastructure.v0.1"
content_version: "chapter-01.medium-hermit.1"
task_id: "ch01_medium_hermit_initiation"
task_type: "forest_medium_initiation"
chapter_flow_id: "ch01_world_literacy_prologue"
region_node_id: "valley.stream_section"
scene_ref: "../scenes/valley-stream-section.v0.1.yaml"
required_event_sequence:
  - "waterwheel_goal_committed"
  - "forest_medium_discovered"
  - "forest_hermit_route_committed"
  - "forest_telo_initiation_committed"
medium:
  medium_id: "artifact.ancient_medium_frame"
  shard_id: "artifact.fragment.forest_site"
  discovery_scene_id: "scene.valley.waterwheel"
  discovery_target_id: "waterwheel.sealed_maintenance_room"
  discovery_event: "forest_medium_discovered"
  tradable: false
  droppable: false
  loss_on_defeat: false
disclosure_event: "forest_medium_disclosure_committed"
hermit_routes:
  - {route_id: "medium.tell_facility_worker", authority_scene_id: "scene.valley.settlement"}
  - {route_id: "medium.follow_fragment_markers", authority_scene_id: "scene.valley.stream_section"}
  - {route_id: "medium.ask_external_trader", authority_scene_id: "scene.valley.settlement"}
hermit_practice:
  authority_scene_id: "scene.valley.stream_section"
  hermit_target_id: "stream.hermit"
  natural_water_target_id: "stream.hermit_water_basin"
  stable_tool_target_id: "stream.hermit_wooden_channel"
  focus_word_id: "word.telo"
  required_actions: [observe_natural_water, predict_manifest_path, perform_low_mp_telo, stabilize_with_tool]
  completion_event: "forest_telo_initiation_committed"
automatic_word_mastery_forbidden: true
automatic_mp_increase_forbidden: true
```

Add the maintenance room/medium interaction to the waterwheel scene, the hermit/basin/channel interactions to the stream scene, and facility-worker/trader disclosure interactions to the settlement scene. Add region state entries for medium discovery, independent disclosure choice, hermit route, and initiation completion with the exact writer events above.

- [ ] **Step 4: Add fail-closed compiler validation**

In `validateSource`, dispatch `task_type === "forest_medium_initiation"` to `validateForestMediumTaskSource`. Implement exact IDs, exact route order, immutable item flags, exact four-action practice, and the no-auto-grant booleans. In cross-reference validation, verify every scene and target exists and that the medium discovery follows `waterwheel_goal_committed`.

Use one issue code for source drift and one for missing references:

```ts
addIssue(issues, "task.forest_medium_contract", source.path, "", "forest medium initiation contract is noncanonical");
addIssue(issues, "ref.forest_medium", source.path, "scene_ref", "forest medium initiation references are invalid");
```

- [ ] **Step 5: Run focused content tests**

Run:

```powershell
pnpm exec vitest run src/content/forest-medium-content.test.ts src/content/scene-compiler.test.ts src/content/settlement-scene.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the medium/hermit authority**

```powershell
git add data/tasks/ch01-medium-hermit-initiation.v0.1.yaml data/scenes/valley-waterwheel.v0.1.yaml data/scenes/valley-stream-section.v0.1.yaml data/scenes/valley-settlement.v0.1.yaml data/world/regions/valley-prologue.v0.1.yaml src/content/compiler.ts src/content/forest-medium-content.test.ts
git commit -m "feat(content): author forest medium initiation"
```

---

### Task 2: Author the persistent large-creature crisis

**Files:**
- Create: `data/tasks/ch01-large-creature-crisis.v0.1.yaml`
- Create: `src/content/forest-large-creature-content.test.ts`
- Modify: `data/ecology/valley-prologue.v0.1.yaml`
- Modify: `data/scenes/valley-return-channel.v0.1.yaml`
- Modify: `data/world/regions/valley-prologue.v0.1.yaml`
- Modify: `src/content/compiler.ts` (`validateEcologySource`, new task validator and references)

**Interfaces:**
- Consumes: persistent wildlife identity and zero-language-evidence-from-harm contracts.
- Produces: entity ID `wildlife.valley.large_semiaquatic_nester`; task ID `ch01_large_creature_crisis`; event `forest_large_creature_resolution_committed`; states `forest_large_creature_resolution` and `forest_large_creature_life_state`.

- [ ] **Step 1: Write positive and mutation tests**

Create tests that assert one authored entity has exact state and resolution contracts:

```ts
expect(largeCreature.behavior_states).toEqual([
  "nesting", "searching_for_young", "warning", "defending", "fleeing", "resettling", "dead",
]);
expect(task.resolution_ids).toEqual([
  "restore_migration_channel", "guide_with_food_and_scent", "wait_and_yield",
  "install_nonlethal_barrier", "drive_away_by_combat", "kill",
]);
expect(task.mandatory_kill).toBe(false);
expect(task.language_evidence_from_harm).toBe(false);
```

Mutate `mandatory_kill`, remove young/nest identity fields, add a mainline quest drop, or make harm produce language evidence. Expect `ecology.forest_large_creature` or `task.forest_large_creature_contract`.

- [ ] **Step 2: Run the focused test and verify it fails**

```powershell
pnpm exec vitest run src/content/forest-large-creature-content.test.ts
```

Expected: FAIL because the large creature and task do not exist.

- [ ] **Step 3: Author the ecology entity and crisis task**

Add one persistent entity to `data/ecology/valley-prologue.v0.1.yaml` with stable life identity inputs, home scene `scene.valley.return_channel`, nest and young IDs, food/water needs, warning telegraph, real escape route, and no mainline drop.

Create `data/tasks/ch01-large-creature-crisis.v0.1.yaml` using `task_type: "forest_large_creature_crisis"`. Author the six resolution IDs in the tested order, their world predicates, a shared `forest_large_creature_resolution_committed` event, and explicit `mandatory_kill: false`, `language_evidence_from_harm: false`, and `attack_qualification_evidence_from_harm: false`.

Add return-wetland targets for nest trace, young trace, migration channel, food/scent guide, and nonlethal barrier. Add region state enums:

```yaml
- state_id: "forest_large_creature_resolution"
  type: enum
  values: [unresolved, migration_restored, guided, yielded, barrier, driven_away, killed]
  initial: unresolved
  unique_writer_event: "forest_large_creature_resolution_committed"
- state_id: "forest_large_creature_life_state"
  type: enum
  values: [alive, injured, dead]
  initial: alive
  unique_writer_events: [wildlife_damage_committed, wildlife_death_committed]
```

- [ ] **Step 4: Validate exact ecology and task semantics**

Extend `validateEcologySource` to require exactly one large semiaquatic main-creature entity with the tested identity, state, escape, no-drop, and harm exclusions. Add a dedicated task validator and cross-reference every authored scene target.

- [ ] **Step 5: Run ecology and content tests**

```powershell
pnpm exec vitest run src/content/forest-large-creature-content.test.ts src/content/wildlife-content.test.ts scripts/content/wildlife-runtime-artifact.test.ts
```

Expected: all tests PASS; the existing rabbit/fox projection remains valid.

- [ ] **Step 6: Commit the crisis authority**

```powershell
git add data/ecology/valley-prologue.v0.1.yaml data/tasks/ch01-large-creature-crisis.v0.1.yaml data/scenes/valley-return-channel.v0.1.yaml data/world/regions/valley-prologue.v0.1.yaml src/content/compiler.ts src/content/forest-large-creature-content.test.ts
git commit -m "feat(content): author forest creature crisis"
```

---

### Task 3: Add the underground order node and three-way allocation

**Files:**
- Create: `data/scenes/valley-underground-order-node.v0.1.yaml`
- Create: `data/tasks/ch01-underground-water-allocation.v0.1.yaml`
- Create: `src/content/forest-underground-content.test.ts`
- Modify: `data/scenes/valley-return-channel.v0.1.yaml`
- Modify: `data/scenes/valley-settlement.v0.1.yaml`
- Modify: `data/scenes/valley-old-mine-threshold.v0.1.yaml`
- Modify: `data/world/regions/valley-prologue.v0.1.yaml`
- Modify: `src/content/compiler.ts`

**Interfaces:**
- Consumes: `forest_large_creature_resolution_committed`, completed five-word availability, and `artifact.fragment.forest_site`.
- Produces: scene ID `scene.valley.underground_order_node`; task ID `ch01_underground_water_allocation`; events `forest_site_synchronized`, `forest_water_allocation_committed`, `forest_site_lead_revealed`, `forest_chapter_epilogue_committed`.

- [ ] **Step 1: Write the topology and allocation tests**

Assert the canonical sequence is return wetland → underground node → settlement and that old mine opens only after the epilogue. Assert exact allocation modes:

```ts
expect(task.allocation_modes.map((mode) => mode.mode_id)).toEqual([
  "settlement_priority", "wetland_priority", "road_trade_priority",
]);
expect(task.perfect_initial_balance_forbidden).toBe(true);
expect(task.later_upgrade_mode).toBe("balanced_upgrade");
expect(task.required_event_sequence).toEqual([
  "forest_large_creature_resolution_committed",
  "forest_site_synchronized",
  "forest_water_allocation_committed",
  "forest_site_lead_revealed",
  "forest_chapter_epilogue_committed",
]);
```

Negative tests must reject an always-open underground entrance, a direct return-to-settlement bypass, a perfect initial balance, missing cost projections, or an old-mine guard other than `forest_chapter_epilogue_committed == true`.

- [ ] **Step 2: Run the focused test and observe failure**

```powershell
pnpm exec vitest run src/content/forest-underground-content.test.ts
```

Expected: FAIL because the underground scene/task are missing.

- [ ] **Step 3: Author the underground scene and task**

The new scene must include entrances from the return wetland, an exit to the settlement, anomaly targets for gravity/time/material/conservation demonstrations, a record archive, a shard synchronization cradle, and a three-channel allocation console. Every required route must have a non-magic recovery path.

Author the three modes with exact immediate consequence IDs:

```yaml
allocation_modes:
  - mode_id: "settlement_priority"
    benefit_ids: [resident_water_stable, crops_stable]
    cost_ids: [wetland_decline_continues, creature_migration_pressure]
  - mode_id: "wetland_priority"
    benefit_ids: [wetland_recovery_started, creature_habitat_stable]
    cost_ids: [settlement_rationing, local_food_price_pressure]
  - mode_id: "road_trade_priority"
    benefit_ids: [medicine_salt_metal_route_open, external_news_route_open]
    cost_ids: [settlement_minimum_supply, wetland_minimum_supply]
perfect_initial_balance_forbidden: true
later_upgrade_mode: "balanced_upgrade"
```

Add region state for shard synchronization, water allocation enum (`unassigned` plus the three modes), site-lead reveal, and epilogue completion. Replace direct `return_channel → settlement` traversal with `return_channel → underground_order_node → settlement`; guard old mine with the epilogue event-derived state.

- [ ] **Step 4: Add source and reference validators**

Implement `validateForestUndergroundTaskSource` and its reference validator. Require exact scene/target IDs, exact event order, three benefits/cost contracts, no perfect initial mode, and `balanced_upgrade` as a later-only mode. Extend scene/region cross-reference tests to fail on topology drift.

- [ ] **Step 5: Run topology tests**

```powershell
pnpm exec vitest run src/content/forest-underground-content.test.ts src/content/scene-reachability.test.ts src/content/old-mine-content.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the underground authority**

```powershell
git add data/scenes/valley-underground-order-node.v0.1.yaml data/tasks/ch01-underground-water-allocation.v0.1.yaml data/scenes/valley-return-channel.v0.1.yaml data/scenes/valley-settlement.v0.1.yaml data/scenes/valley-old-mine-threshold.v0.1.yaml data/world/regions/valley-prologue.v0.1.yaml src/content/compiler.ts src/content/forest-underground-content.test.ts
git commit -m "feat(content): author underground water allocation"
```

---

### Task 4: Switch the chapter to the canonical 180-minute 7+2 structure

**Files:**
- Create: `src/content/forest-chapter-content.test.ts`
- Modify: `data/chapters/ch01-world-literacy-prologue.v0.1.yaml`
- Modify: `data/tasks/ch01-service-channel.v0.1.yaml`
- Delete: `data/scenes/valley-service-channel.v0.1.yaml`
- Modify: `data/scenes/valley-waterwheel.v0.1.yaml`
- Modify: `data/scenes/valley-high-cistern.v0.1.yaml`
- Modify: `data/world/regions/valley-prologue.v0.1.yaml`
- Modify: `src/content/compiler.ts` (`validatePrologueAcceptanceSource`, new `validateForestChapterSource`)
- Modify: `scripts/content/prologue-acceptance-runtime-artifact.ts`
- Modify: `src/content/runtime-prologue-acceptance-manifest.ts`
- Modify: `src/content/runtime-prologue-acceptance-manifest.test.ts`
- Modify: `scripts/content/runtime-artifact.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: task/scene authorities from Tasks 1–3.
- Produces: nine canonical story segments across seven main scenes, two optional scenes, and an updated prologue acceptance projection.

- [ ] **Step 1: Write exact segment and topology tests**

Use this canonical segment table in both test and implementation:

```ts
const CANONICAL_FOREST_SEGMENTS = [
  ["arrival_tools", [0, 30], ["valley.arrival_shelf", "valley.stream_section"], []],
  ["settlement_work", [30, 55], ["valley.settlement"], []],
  ["waterwheel_discovery", [55, 75], ["valley.waterwheel"], []],
  ["hermit_initiation", [75, 95], ["valley.stream_section"], ["telo"]],
  ["cistern_motion", [95, 105], ["valley.high_cistern"], ["tawa"]],
  ["cistern_scale", [105, 120], ["valley.high_cistern"], ["lili", "suli"]],
  ["wetland_crisis", [120, 148], ["valley.return_channel"], ["wawa"]],
  ["underground_node", [148, 173], ["valley.underground_order_node"], []],
  ["allocation_epilogue", [173, 180], ["valley.settlement"], []],
] as const;
```

Assert ranges are contiguous, end at `180`, N00/N01 focus no active word, and the unique active-word set is exactly `telo/tawa/lili/suli/wawa`. Assert the main scene list and optional scene list exactly match the design spec.

- [ ] **Step 2: Run the chapter test and verify legacy drift**

```powershell
pnpm exec vitest run src/content/forest-chapter-content.test.ts src/content/runtime-prologue-acceptance-manifest.test.ts
```

Expected: FAIL because the generated projection still contains arrival `telo`, service-channel `o`, and the old topology.

- [ ] **Step 3: Rewrite the chapter contract**

Change the chapter `content_version` to `chapter-01.forest.2`. Replace the segment list with the canonical table and reference Tasks 1–3. Add a `forest_chapter_contract` object containing:

```yaml
working_title_zh: "水往何处"
target_median_minutes: 180
first_play_range_minutes: [150, 240]
main_scene_ids:
  - "scene.valley.arrival_shelf"
  - "scene.valley.stream_section"
  - "scene.valley.settlement"
  - "scene.valley.waterwheel"
  - "scene.valley.high_cistern"
  - "scene.valley.return_channel"
  - "scene.valley.underground_order_node"
optional_scene_ids: ["scene.valley.den_bypass", "scene.valley.safe_range"]
post_chapter_boundary_scene_id: "scene.valley.old_mine_threshold"
mandatory_kills: 0
mandatory_wildlife_products: 0
medium_usable_before_hermit_initiation: false
```

Rehome `ch01_service_channel` to the waterwheel scene/node as a lower-subarea task, move its required targets into the waterwheel scene, remove the standalone service-channel scene and region node, and connect waterwheel directly to high cistern.

- [ ] **Step 4: Update compiler and prologue acceptance authority together**

Implement `validateForestChapterSource` with the canonical table and topology. Update `validatePrologueAcceptanceSource`, `projectPrologueAcceptance`, `PROLOGUE_SEGMENT_FOCUS`, the expected source content version, and runtime reader tests in the same commit so content generation never depends on the obsolete segments.

- [ ] **Step 5: Generate runtime content and run chapter gates**

```powershell
pnpm run content:generate
pnpm exec vitest run src/content/forest-chapter-content.test.ts src/content/runtime-prologue-acceptance-manifest.test.ts src/content/infrastructure-content.test.ts scripts/content/runtime-artifact.test.ts
```

Expected: generation succeeds and all focused tests PASS.

- [ ] **Step 6: Commit the chapter switch**

```powershell
git add data/chapters/ch01-world-literacy-prologue.v0.1.yaml data/tasks/ch01-service-channel.v0.1.yaml data/scenes/valley-service-channel.v0.1.yaml data/scenes/valley-waterwheel.v0.1.yaml data/scenes/valley-high-cistern.v0.1.yaml data/world/regions/valley-prologue.v0.1.yaml src/content/compiler.ts src/content/forest-chapter-content.test.ts scripts/content/prologue-acceptance-runtime-artifact.ts src/content/runtime-prologue-acceptance-manifest.ts src/content/runtime-prologue-acceptance-manifest.test.ts scripts/content/runtime-artifact.ts src/generated/content-runtime.v0.1.json
git commit -m "feat(content): switch to forest chapter structure"
```

---

### Task 5: Project a strict runtime forest chapter manifest

**Files:**
- Create: `scripts/content/forest-chapter-runtime-artifact.ts`
- Create: `scripts/content/forest-chapter-runtime-artifact.test.ts`
- Create: `src/content/runtime-forest-chapter-manifest.ts`
- Create: `src/content/runtime-forest-chapter-manifest.test.ts`
- Modify: `scripts/content/runtime-artifact.ts`
- Modify: `src/content/index.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: validated chapter, region, scenes, ecology, and Tasks 1–3.
- Produces: `RuntimeContentArtifact.forestChapter` and `readRuntimeForestChapterManifest(candidate)`.

- [ ] **Step 1: Write projection and strict-reader tests**

Test actual repository content, then deep-clone the generated object and independently mutate: segment timing, main-scene order, medium auto-grant flag, hermit route, large-creature kill requirement, allocation benefit/cost, and old-mine guard. Recompute the outer digest after each mutation; the reader must still reject the semantic drift.

Also assert:

```ts
const chapter = readRuntimeForestChapterManifest(generated);
expect(Object.isFrozen(chapter)).toBe(true);
expect(chapter.mainSceneIds).toHaveLength(7);
expect(chapter.optionalSceneIds).toEqual([
  "scene.valley.den_bypass",
  "scene.valley.safe_range",
]);
expect(chapter.activeWordIds).toEqual(["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"]);
expect(chapter.allocation.modeIds).toEqual([
  "settlement_priority", "wetland_priority", "road_trade_priority",
]);
```

- [ ] **Step 2: Run the new tests and verify missing exports**

```powershell
pnpm exec vitest run scripts/content/forest-chapter-runtime-artifact.test.ts src/content/runtime-forest-chapter-manifest.test.ts
```

Expected: FAIL because the projector and reader do not exist.

- [ ] **Step 3: Define the runtime interface**

Create a focused interface with no raw YAML expressions:

```ts
export interface RuntimeForestChapterManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly chapterFlowId: "ch01_world_literacy_prologue";
  readonly contentVersion: "chapter-01.forest.2";
  readonly workingTitleZh: "水往何处";
  readonly targetMedianMinutes: 180;
  readonly firstPlayRangeMinutes: readonly [150, 240];
  readonly mainSceneIds: readonly string[];
  readonly optionalSceneIds: readonly string[];
  readonly postChapterBoundarySceneId: "scene.valley.old_mine_threshold";
  readonly activeWordIds: readonly ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"];
  readonly segments: readonly Readonly<{
    segmentId: string;
    minuteRange: readonly [number, number];
    sceneIds: readonly string[];
    activeNewWordIds: readonly string[];
  }>[];
  readonly medium: Readonly<{
    mediumId: "artifact.ancient_medium_frame";
    shardId: "artifact.fragment.forest_site";
    discoveryEventId: "forest_medium_discovered";
    initiationEventId: "forest_telo_initiation_committed";
    hermitRouteIds: readonly string[];
    automaticWordMasteryForbidden: true;
    automaticMpIncreaseForbidden: true;
  }>;
  readonly largeCreature: Readonly<{
    entityId: "wildlife.valley.large_semiaquatic_nester";
    resolutionEventId: "forest_large_creature_resolution_committed";
    resolutionIds: readonly string[];
    mandatoryKill: false;
    languageEvidenceFromHarm: false;
  }>;
  readonly allocation: Readonly<{
    commitEventId: "forest_water_allocation_committed";
    modeIds: readonly ["settlement_priority", "wetland_priority", "road_trade_priority"];
    benefitIdsByMode: Readonly<Record<string, readonly string[]>>;
    costIdsByMode: Readonly<Record<string, readonly string[]>>;
    perfectInitialBalanceForbidden: true;
    laterUpgradeMode: "balanced_upgrade";
  }>;
}
```

- [ ] **Step 4: Implement projector and strict reader**

The projector must read only from `ContentManifest` after validation and compute `sourceDigest` over the projected body. The reader must use `computeRuntimeManifestDigest`, exact-key helpers, exact canonical arrays, contiguous segment checks, seven/optional scene counts, and deep freeze. Add a module-private `WeakSet` brand and `isVerifiedRuntimeForestChapterManifest` following `runtime-prologue-acceptance-manifest.ts`.

Wire `forestChapter` into `RuntimeContentArtifact`, `buildRuntimeContentArtifact`, and `src/content/index.ts`.

- [ ] **Step 5: Generate and run projection tests**

```powershell
pnpm run content:generate
pnpm exec vitest run scripts/content/forest-chapter-runtime-artifact.test.ts src/content/runtime-forest-chapter-manifest.test.ts scripts/content/runtime-artifact.test.ts
```

Expected: all tests PASS and generated content contains a digest-bound `forestChapter` object.

- [ ] **Step 6: Commit the runtime authority**

```powershell
git add scripts/content/forest-chapter-runtime-artifact.ts scripts/content/forest-chapter-runtime-artifact.test.ts src/content/runtime-forest-chapter-manifest.ts src/content/runtime-forest-chapter-manifest.test.ts scripts/content/runtime-artifact.ts src/content/index.ts src/generated/content-runtime.v0.1.json
git commit -m "feat(content): project forest chapter authority"
```

---

### Task 6: Separate five active chapter words from the broader curriculum

**Files:**
- Modify: `data/language/p0-curriculum.v0.1.yaml`
- Modify: `scripts/content/p0-runtime-artifact.ts`
- Modify: `src/content/runtime-p0-curriculum-manifest.ts`
- Modify: `src/content/runtime-p0-curriculum-manifest.test.ts`
- Modify: `src/content/compiler.ts`
- Modify: `src/content/forest-chapter-content.test.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: `RuntimeForestChapterManifest.activeWordIds`.
- Produces: `p0Curriculum.firstChapterActiveMasteryWordIds` and `p0Curriculum.additionalReceptiveWordIds`; removes any 10–12 word first-chapter release gate.

- [ ] **Step 1: Write the curriculum boundary tests**

Add assertions that the five active IDs are exact and that `o/li/e` are structure particles, not active content words. Assert all other P0 words are receptive/optional for this chapter and cannot block `forest_chapter_epilogue_committed`.

Mutation cases: add `word.seli` to active mastery, remove `word.wawa`, count `o` as an active content word, or bind chapter completion to all P0 words. Each must fail compiler or strict reader.

- [ ] **Step 2: Run the focused tests and observe legacy expectations**

```powershell
pnpm exec vitest run src/content/runtime-p0-curriculum-manifest.test.ts src/content/forest-chapter-content.test.ts
```

Expected: FAIL because the existing P0 projection does not distinguish first-chapter active and receptive scope.

- [ ] **Step 3: Author and project the scope split**

Add exact YAML fields:

```yaml
first_chapter_active_mastery_word_ids: [word.telo, word.tawa, word.lili, word.suli, word.wawa]
first_chapter_structure_particle_ids: [o, li, e]
first_chapter_completion_requires_all_p0_words: false
```

Project additional P0 entries as receptive/optional without deleting their future curriculum definitions. Extend the strict reader with exact keys and set-equality against `forestChapter.activeWordIds`.

- [ ] **Step 4: Generate and run curriculum tests**

```powershell
pnpm run content:generate
pnpm exec vitest run src/content/runtime-p0-curriculum-manifest.test.ts src/content/forest-chapter-content.test.ts src/content/runtime-forest-chapter-manifest.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the chapter curriculum boundary**

```powershell
git add data/language/p0-curriculum.v0.1.yaml scripts/content/p0-runtime-artifact.ts src/content/runtime-p0-curriculum-manifest.ts src/content/runtime-p0-curriculum-manifest.test.ts src/content/compiler.ts src/content/forest-chapter-content.test.ts src/generated/content-runtime.v0.1.json
git commit -m "feat(content): scope forest chapter core words"
```

---

### Task 7: Lock integration gates and hand off to runtime implementation

**Files:**
- Create: `src/content/forest-chapter-authority.integration.test.ts`
- Modify: `docs/design/README.md`
- Modify: `docs/design/world/02-worldbuilding-consistency-audit-zh.md`
- Modify: `docs/superpowers/specs/2026-08-28-forest-chapter-design.md`

**Interfaces:**
- Consumes: all Tasks 1–6 and generated runtime content.
- Produces: one integration gate proving the content authority is internally fixed and a documented runtime-plan handoff.

- [ ] **Step 1: Write a single cross-domain authority test**

The test must compile repository sources, build the runtime artifact, read the verified forest chapter, scene, ecology, P0, and prologue acceptance manifests, then assert:

```ts
expect(forest.mainSceneIds.every((sceneId) => scenes.byId[sceneId] !== undefined)).toBe(true);
expect(forest.optionalSceneIds.every((sceneId) => scenes.byId[sceneId] !== undefined)).toBe(true);
expect(forest.medium.automaticWordMasteryForbidden).toBe(true);
expect(forest.largeCreature.mandatoryKill).toBe(false);
expect(forest.activeWordIds).toEqual(p0.firstChapterActiveMasteryWordIds);
expect(prologue.telemetry.segmentFocus.map(({ segmentId }) => segmentId)).toEqual(
  forest.segments.map(({ segmentId }) => segmentId),
);
expect(forest.allocation.modeIds).toHaveLength(3);
```

Also assert service-channel scene is absent from `forest.mainSceneIds`, old mine is absent from both main/optional arrays, and underground order node is present.

- [ ] **Step 2: Run the integration test**

```powershell
pnpm exec vitest run src/content/forest-chapter-authority.integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update design status without claiming gameplay completion**

In the design spec, mark only “content authority” as implemented. In the consistency audit, close P0-03 and the content-contract portion of P0-01/P0-02/P0-04/P0-05 while leaving runtime, UI, and art portions open. Link the next runtime implementation plan from `docs/design/README.md` only after that plan is written.

- [ ] **Step 4: Run the full verification gate on Node 22**

```powershell
pnpm run content:check
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Expected: all commands exit `0`; Vitest reports zero failed files/tests; generated runtime content is byte-current.

- [ ] **Step 5: Commit the integration gate**

```powershell
git add src/content/forest-chapter-authority.integration.test.ts docs/design/README.md docs/design/world/02-worldbuilding-consistency-audit-zh.md docs/superpowers/specs/2026-08-28-forest-chapter-design.md
git commit -m "test(content): gate forest chapter authority"
```

- [ ] **Step 6: Push and verify the remote branch**

```powershell
git push origin codex/world-scale-prototype
$local = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/codex/world-scale-prototype -split "\s+")[0]
if ($local -ne $remote) { throw "remote branch does not match local HEAD" }
```

Expected: remote SHA equals local SHA and the working tree is clean.

## Plan Self-Review Matrix

| Spec requirement | Covered by |
|---|---|
| Three-hour pacing and gameplay budget | Tasks 4, 5, 7 |
| 7+2 topology and service-channel merge | Tasks 3, 4, 5, 7 |
| Medium frame, forest shard, hermit routes/practice | Tasks 1, 4, 5, 7 |
| Large semiaquatic creature and zero-kill boundary | Tasks 2, 5, 7 |
| Underground node and three-way allocation | Tasks 3, 5, 7 |
| Five active words without 12-word release gate | Tasks 4, 6, 7 |
| Digest-bound strict runtime authority | Task 5 |
| Existing logic preserved for later migration | Global constraints and Task 7 documentation |
| UI, art, runtime reducers, save/replay, E2E | Explicitly assigned to follow-up plans; not falsely claimed here |
