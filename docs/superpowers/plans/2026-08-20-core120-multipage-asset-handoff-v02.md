# Core-120 Multi-page Asset Handoff v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the public Core-120 asset reader and boundary with the private repository's real multi-page glyph bundle while preserving fail-closed approval and pronunciation gates.

**Architecture:** The public repository receives a strict v0.2 candidate/approved parser and multi-file boundary audit. The private repository receives a deterministic Python generator that emits a safe review candidate and private release-gate candidate, but never approval. The v0.1 missing placeholder remains a migration input only.

**Tech Stack:** TypeScript 7, Vitest 4, Node crypto/fs, Python 3 standard library, JSON, existing asset release gate.

**Spec:** `docs/superpowers/specs/2026-08-20-core120-multipage-asset-handoff-v02.md`

## Global Constraints

- The checked-in public repository remains `safe_blocked_pending_external_approval`.
- v0.1 `missing` is accepted; v0.1 `approved` is rejected.
- The generator emits only `review_candidate`, never `approved`.
- Require 120 generated words, two activation pages, one pattern page, one edge page, eight 32x32 frames per word, and 1024x1024 pages.
- Public paths remain below `assets/magic-glyphs/pu120-v2/` and privacy booleans remain false.
- Human approvals and 120 pronunciation files remain external inputs.

---

### Task 1: Public v0.2 parser

**Files:**
- Create: `src/assets/runtime-core120-private-export.v0.2.json`
- Modify: `src/assets/runtime-core120-assets.ts`
- Modify: `src/assets/runtime-core120-assets.test.ts`

**Interfaces:**
- Consumes: verified `RuntimeCore120CurriculumManifest`.
- Produces: `readRuntimeCore120AssetExportCandidate()` and expanded approved bundle/frame types.

- [x] **Step 1: Write failing tests** for v0.2 missing, complete review candidate, approved data, v0.1 missing migration, and v0.1 approved rejection.
- [x] **Step 2: Verify RED.**

```powershell
pnpm exec vitest run src/assets/runtime-core120-assets.test.ts
```

Expected: failure because the v0.2 parser does not exist.

- [x] **Step 3: Implement minimal strict parsing** with exact keys, hashes, page/path/dimension validation, bounds, rectangle uniqueness, generated word bindings, privacy, and status-dependent pronunciation/approval rules.
- [x] **Step 4: Verify GREEN** with the focused command above.
- [x] **Step 5: Commit.**

```powershell
git add src/assets/runtime-core120-assets.ts src/assets/runtime-core120-assets.test.ts src/assets/runtime-core120-private-export.v0.2.json
git commit -m "feat: add Core-120 multi-page asset export contract"
```

### Task 2: Public multi-file boundary audit

**Files:**
- Modify: `scripts/assets/public-runtime-boundary.ts`
- Modify: `scripts/assets/public-runtime-boundary.test.ts`

**Interfaces:**
- Consumes: approved `glyphBundle` plus files in `public/assets`.
- Produces: approval only after all bundle hashes and atlas entries match.

- [x] **Step 1: Write a failing future fixture** with two activation PNGs, pattern/edge PNGs, palette JSON, atlas JSON, and 120 pronunciations. Assert seven glyph files including README.
- [x] **Step 2: Verify RED.**

```powershell
pnpm exec vitest run scripts/assets/public-runtime-boundary.test.ts
```

- [x] **Step 3: Implement exact file-set/hash validation** and parse the atlas JSON to compare digest, pages, dimensions, and all 120 coordinate entries with the approved export.
- [x] **Step 4: Verify GREEN.**

```powershell
pnpm exec vitest run src/assets/runtime-core120-assets.test.ts scripts/assets/public-runtime-boundary.test.ts scripts/assets/release-gate.test.ts
```

- [x] **Step 5: Commit.**

```powershell
git add scripts/assets/public-runtime-boundary.ts scripts/assets/public-runtime-boundary.test.ts
git commit -m "feat: audit Core-120 multi-page runtime bundle"
```

### Task 3: Private deterministic candidate generator

**Files:**
- Create: `scripts/glyphs/build_core120_asset_handoff_v2.py`
- Create: `scripts/glyphs/test_build_core120_asset_handoff_v2.py`
- Create: `work/runtime-candidates/pu120-v2/*.json`
- Create: `manifests/releases/*.json`

**Interfaces:**
- Consumes: public runtime artifact; private catalog, atlas, palette, license record, and asset files.
- Produces: safe v0.2 review candidate, sanitized runtime manifests, and private release-gate candidate.

- [x] **Step 1: Write a failing standard-library unittest** asserting exact order/coordinates/hashes, pending approvals, null pronunciation, privacy, no absolute/private paths in the safe export, and byte-identical repeated output.
- [x] **Step 2: Verify RED.**

```powershell
python -m unittest scripts.glyphs.test_build_core120_asset_handoff_v2 -v
```

- [x] **Step 3: Implement the generator** using `argparse`, `hashlib`, `json`, and `pathlib`; validate every declared hash; hardcode review-candidate/pending state with no approval option.
- [x] **Step 4: Verify GREEN and generate real candidates twice.** The second run must produce no diff.
- [x] **Step 5: Re-run existing private validators.**

```powershell
python scripts/glyphs/validate_pu120_glyph_atlas.py source/glyph-mapping/pu-120-glyph-catalog.v0.2.json work/magic-glyphs/sitelen-seli-kiwen-mono-juniko/background-independent/pu120/v001
python scripts/glyphs/validate_surface_composites_v2.py source/glyph-mapping/pu-120-glyph-catalog.v0.2.json work/magic-glyphs/sitelen-seli-kiwen-mono-juniko/background-independent/pu120/v001/manifests/pu120-glyph-atlas.v0.1.json source/surface-profiles/magic-glyph-surface-profiles.v0.2.json
```

Expected: 120 glyphs, 960 frames, 19,200 deterministic surface hash pairs, zero failures.

- [x] **Step 6: Commit.**

```powershell
git add scripts/glyphs work/runtime-candidates manifests/releases
git commit -m "assets: generate Core-120 v0.2 review candidate"
```

### Task 4: Documentation and cross-repository contract check

**Files:**
- Modify: private `README.md`
- Modify: public `public/assets/magic-glyphs/README.md`
- Keep: approved spec and this plan current if verified interfaces differ.

**Interfaces:**
- Consumes: real private candidate and public parser.
- Produces: reproducible operator commands and explicit remaining blockers.

- [x] **Step 1: Add a public golden candidate test** using a deterministic digest/schema assertion, without depending on a private filesystem path.
- [x] **Step 2: Verify RED**, then wire the golden fixture and verify GREEN.
- [x] **Step 3: Document generation, audit, promotion, and later 120-OGG intake.** State that a current audit is expected to deny pending human approvals.
- [x] **Step 4: Run public focused gates and private deterministic gates.**
- [x] **Step 5: Search the public diff** for drive paths, `file://`, private repository names, source fonts, review media, and approval claims; require no matches.
- [x] **Step 6: Commit documentation.**

### Task 5: Final verification and branch publication

**Files:** No planned production changes.

**Interfaces:**
- Consumes: both completed branches.
- Produces: verified pushed branches without claiming external approval.

- [x] **Step 1: Run full public verification.**

```powershell
pnpm run verify
```

- [x] **Step 2: Re-run private generator idempotency, atlas validation, and surface validation.**
- [x] **Step 3: Require both worktrees clean** and confirm the public history contains no private binaries.
- [x] **Step 4: Push** `codex/core120-asset-export-v02` and `codex/glyph-activation-assets-v0.2`; do not claim release approval.
