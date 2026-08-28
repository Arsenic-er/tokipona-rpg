# Final review fix report

## Scope and base

- Base: `b0ad69b5a406dd7c43e4a0726f3c932b08a648c8`.
- Runtime used for every verification command: Node `v22.14.0` from `C:\Users\jiang\.cache\tokipona-node-v22.14.0\node-v22.14.0-win-x64`.
- Findings addressed: pre-hermit N00/N01 active `telo`, stale glyph-progression `service_channel`/active-`o` metadata, and permanently rejected old-mine lazy UI promise.
- Out of scope and unchanged: underground runtime coordinator, three-hour completion certification, release certification, N07→N02 direct bypass, automatic allocation/epilogue, trusted adapter/WAL/replay safeguards.

## Root causes verified

1. `valley-arrival-shelf` and `valley-stream-section` still authored legacy optional-magic routes and unguarded `telo` fill interactions. The compiler validated only that each scene retained at least one non-magic route, so these stale routes could coexist with the new forest contract.
2. `PrologueArrivalStreamSession` directly owned a `TeloLearningSlice`, pre-seeded both attunement materials, committed discovery/attunement evidence, consumed MP, and persisted manifested water without any verified forest-medium or hermit-initiation runtime authority. `PrologueFlowSession`, `rpg-main.ts`, and the world-scale UI delegated to those methods.
3. Glyph progression carried an unvalidated `{segment: service_channel, chapter_role: active}` record even though the standalone scene had been deleted and the service task had moved to `scene.valley.waterwheel` with receptive-only `o` contact.
4. `rpg-main.ts` cached `import("./rpg-old-mine-ui")` in `oldMineUiLoad`; a rejection left the same rejected promise installed forever and exposed no recoverable UI state.

## Delivered changes

### Pre-hermit content and runtime closure

- Removed `arrival.telo_optional`, `arrival.fill_flume`, `stream.telo_observation`, and `stream.fill_basin` from authoritative scene YAML.
- Kept every existing non-magic N00/N01 route and the hermit-practice-only `stream.perform_low_mp_telo` interaction.
- Added compiler authority checks that:
  - require every N00 route to be non-magic and every N00 interaction to have no optional word;
  - require every N01 navigation route to be non-magic;
  - permit exactly the guarded hermit-practice `word.telo` interaction in N01;
  - reject mutation attempts with `scene.pre_hermit_magic_forbidden`.
- Removed fresh-save attunement materials and the obsolete manifestation coordinator from `PrologueArrivalStreamSession`.
- `discoverTelo`, `attuneTelo`, and `manifestTelo` now validate IDs, then fail closed with `prerequisite_missing` and no mutation because no trusted medium/initiation runtime authority exists yet.
- Deleted legacy magic-route readiness and legacy manifested-water restoration, so an old persisted `route.manifested-water-settled` flag cannot revive the removed route.
- Removed production RPG Flow calls and actionable telo controls/prompts; the glyph remains observation-only scenery. The world-scale interaction projection is non-actionable and the controller returns `not_available`.
- Generated runtime content was refreshed; generated N00/N01 scene projections contain only non-magic routes and no legacy fill interactions.

### Glyph authority repair

- Replaced the stale glyph record with the exact receptive-only binding:
  - chapter segment `waterwheel_discovery`;
  - scene `scene.valley.waterwheel`;
  - subarea entrance `waterwheel.lower_maintenance.entry`;
  - chapter role `receptive`.
- Added cross-authority validation tying the glyph record to the chapter segment, waterwheel entrance, rehomed `ch01_service_channel` task, and its receptive/no-grant `o` grammar contact. Drift fails with `ref.glyph_waterwheel_particle`.
- The overall active forest curriculum remains exactly `telo,tawa,lili,suli,wawa`; structural particles remain separate.

### Retryable lazy old-mine UI

- Added a small generic retryable lazy loader with explicit `idle`, `loading`, `ready`, and `error` states.
- Rejections are converted to fail-closed error state and clear the in-flight promise; a retry creates a new import attempt, while concurrent calls share one in-flight promise.
- `rpg-main.ts` now displays a polite loading/error live region and an explicit retry button. It still loads `rpg-old-mine-ui` only through dynamic `import()`.
- Production build retained the old-mine UI as a separate dynamic chunk and passed the existing forest import-closure check.

## TDD and regression evidence

### RED

- Content/compiler focused run failed because canonical N00/N01 still contained optional-magic routes, the compiler accepted injected magic mutations, glyph metadata remained `service_channel`/active, and glyph mutations compiled.
- Production focused run failed because discovery and Flow delegation returned `accepted: true` and committed learning evidence.
- World UI focused run failed at the legacy N01 glyph position because it projected `E · 观察 telo` and accepted discovery.
- Lazy-loader suite initially failed because the retryable loader did not exist; the test specifies rejection recovery, shared concurrent retry, ready caching, and user-visible loading/error presentation.

### GREEN

- Final focused command: `pnpm exec vitest run scripts/content/runtime-artifact.test.ts src/content/scene-compiler.test.ts src/content/infrastructure-content.test.ts src/game/prologue-arrival-stream.test.ts src/game/prologue-flow.test.ts src/world-scale-main.test.ts src/visual/world-interaction.test.ts src/retryable-lazy-loader.test.ts src/rpg-old-mine-ui.test.ts --reporter=verbose`.
- Result: PASS, `9` files / `52` tests.
- Coverage includes compiler mutations, generated artifact projection, no evidence/attunement/MP/cast mutation, old legacy-flag closure, Flow delegation, world UI prompts/controller, glyph cross-authority, loader rejection/retry/concurrency, and old-mine UI behavior.

## Final Node 22 gates

| Gate | Result |
|---|---|
| `pnpm run content:check` | PASS; both generated runtime files current. |
| `pnpm run typecheck` | PASS. |
| `pnpm test` | PASS; `144` files / `861` tests. |
| `pnpm run build` | PASS; Vite build, forest dynamic-import closure, and bundle budget all passed. |
| RPG bundle | PASS; `1,114,004` initial JS bytes / `18` requests, below unchanged `1,126,400` budget. |
| Largest chunk | PASS; `317,260` bytes, below `327,680`. |
| `pnpm run acceptance:three-hour` | Expected BLOCK, exit `1`, at `underground_handoff_required`. |
| `pnpm run release:check` | Expected BLOCK, exit `1`, because three-hour certification remains unavailable. |
| `git diff --check` | PASS before report/commit; final check repeated before commit. |

## Self-review and remaining concerns

- No raw YAML parsing was added to runtime code.
- No medium discovery or hermit-initiation completion was fabricated. Until a later trusted runtime implements those authorities, the legacy N00/N01 learning/casting methods intentionally remain unavailable.
- Non-magic navigation and tool-route persistence are preserved.
- Existing saves may still contain historical learning/economy records, but N00/N01 do not consume, extend, or turn them into a route; the removed manifestation flag is ignored without rewriting the save.
- `underground_handoff_required` remains the intentional production boundary. Three-hour and public release certification remain nonzero.
- The old-mine retry UI uses a generic loader so its state machine is unit-tested without eagerly importing the old-mine chunk; the production build verifies the actual chunk remains deferred.
