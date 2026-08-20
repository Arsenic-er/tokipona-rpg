# Private Glyph Handoff v0.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the private repository's currently missing deterministic Core-120 handoff generator and make its candidate documents glyph-only v0.3 with no audio fields.

**Architecture:** A standard-library/PyYAML Python generator reads the verified public Core-120 manifest plus the checked-in private catalog, atlas, palette, files, and license record. It emits a public-safe glyph review candidate and a private release-gate candidate; CI regenerates into a temporary directory and compares bytes without changing approval state.

**Tech Stack:** Python 3.11, PyYAML 6.0.3, Pillow 12.3.0, unittest, GitHub Actions.

**Spec:** `C:/Users/jiang/Documents/toki-pona/.worktrees/codex-dialogue-blips/docs/superpowers/specs/2026-08-20-procedural-dialogue-audio-design.md`

## Global Constraints

- Work only in private repository `tokipona-asset` on `codex/glyph-activation-assets-v0.1` unless a separate private worktree is authorized.
- Never copy private source paths, source fonts, review renders, consent material, or unapproved binaries into the public repository.
- Generator output is always `review_candidate`, `runtime_ready: false`, and pending approvals; no CLI flag may approve it.
- The public-safe candidate contains no private path and no audio/pronunciation field.
- Existing 120 unique glyphs, 960 activation frames, four surface profiles, and deterministic validator hashes remain unchanged.
- Stage, commit, push, and PR status changes each require explicit user authorization.

---

### Task 1: Add a deterministic glyph-only handoff generator

**Files:**
- Create: `scripts/glyphs/build_core120_asset_handoff_v3.py`
- Create: `scripts/glyphs/test_build_core120_asset_handoff_v3.py`
- Modify: `requirements-ci.txt`

**Interfaces:**
- Consumes: public generated content JSON, private v0.2 glyph catalog JSON, atlas JSON, palette JSON, font license YAML, private repository root, output directory.
- Produces: `runtime-core120-private-export.v0.3.review-candidate.json` and `pu120-release-gate.v0.3.review-candidate.json`.

- [ ] **Step 1: Pin YAML parsing and write the failing unit test**

Append exactly `PyYAML==6.0.3` to `requirements-ci.txt`.

```py
candidate = json.loads((out / "runtime-core120-private-export.v0.3.review-candidate.json").read_text())
self.assertEqual(candidate["schemaVersion"], "tokipona.pu120-private-asset-export.v0.3")
self.assertEqual(candidate["status"], "review_candidate")
self.assertEqual(len(candidate["wordIds"]), 120)
self.assertEqual(set(candidate["entries"]["telo"]), {"glyph"})
self.assertNotIn("pronunciation", json.dumps(candidate).lower())
self.assertNotIn(str(repo_root), json.dumps(candidate))
```

Run: `python -m unittest scripts.glyphs.test_build_core120_asset_handoff_v3 -v`

Expected: FAIL because the generator does not exist.

- [ ] **Step 2: Implement strict input and hash verification**

The generator CLI is:

```text
python scripts/glyphs/build_core120_asset_handoff_v3.py \
  --public-runtime <content-runtime.v0.1.json> \
  --catalog source/glyph-mapping/pu-120-glyph-catalog.v0.2.json \
  --atlas work/.../manifests/pu120-glyph-atlas.v0.1.json \
  --palette work/.../manifests/pu120-glyph-palettes.v0.1.json \
  --license-record legal/license-records/fonts/sitelen-seli-kiwen-mono-juniko.yaml \
  --asset-root . \
  --output-dir <directory>
```

Resolve every private input below `asset-root`, reject symlinks and path escape, verify SHA-256 for each runtime candidate, require exact generated word order and 120 unique frame bindings, and write canonical UTF-8 JSON with sorted keys and a trailing newline.

- [ ] **Step 3: Emit safe and private candidates**

The safe document contains public paths under the existing `assets/magic-glyphs/pu120-v2/` glyph bundle, hashes, dimensions, page/frame coordinates, `sourceUrl: null`, `licenseSpdx: OFL-1.1`, all eight approvals `pending`, and privacy booleans `false`. Schema v0.3 changes the handoff shape only; it does not rename unchanged glyph files.

The private gate candidate contains relative source-to-target mappings only, `destination_root: magic_glyphs`, `destination: pu120-v2`, `runtime_ready: false`, and no approval path. Both documents contain no pronunciation/audio key.

- [ ] **Step 4: Prove deterministic and fail-closed behavior**

Unit tests run the generator twice and compare bytes, then mutate a hash, coordinate, word order, path, approval, and audio field and assert deterministic rejection with public-safe reason text.

Run: `python -m unittest scripts.glyphs.test_build_core120_asset_handoff_v3 -v`

Expected: PASS.

---

### Task 2: Check in review candidates without claiming approval

**Files:**
- Create: `manifests/releases/runtime-core120-private-export.v0.3.review-candidate.json`
- Create: `manifests/releases/pu120-release-gate.v0.3.review-candidate.json`
- Create: `work/runtime-candidates/pu120-v3/pu120-glyph-atlas.v0.2.json`
- Create: `work/runtime-candidates/pu120-v3/pu120-glyph-palettes.v0.1.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 generator.
- Produces: deterministic draft candidates for public-reader dry runs and human review.

- [ ] **Step 1: Generate from canonical checked-in inputs**

Run the Task 1 CLI against the public feature worktree's generated runtime artifact and this private repository.

Expected: four deterministic JSON files, all review-only and glyph-only.

- [ ] **Step 2: Audit privacy and status**

```powershell
rg -n "[A-Z]:\\|file://|source/fonts|review/|pronunciation|audio" manifests/releases work/runtime-candidates/pu120-v3
```

Expected: no private-path or audio match. Source-file mappings exist only in the private release-gate candidate and remain relative below the private root.

- [ ] **Step 3: Document the boundary**

README must state that v0.3 exports exactly the glyph bundle, does not contain speech/audio, and cannot become approved from generation or CI.

---

### Task 3: Enforce v0.3 generation in private CI

**Files:**
- Modify: `.github/workflows/verify-assets.yml`
- Modify: `docs/superpowers/plans/2026-08-20-private-asset-ci.md`

**Interfaces:**
- Consumes: checked-in v0.3 candidates and Task 1 generator.
- Produces: a read-only private PR check proving candidates are byte-current and existing glyph validators remain green.

- [ ] **Step 1: Add compile and unittest steps**

```yaml
- name: Compile validator and handoff modules
  run: python -m compileall -q scripts/glyphs
- name: Test glyph-only handoff generator
  run: python -m unittest scripts.glyphs.test_build_core120_asset_handoff_v3 -v
```

- [ ] **Step 2: Regenerate into runner temp and compare bytes**

Run the generator with `--output-dir "$RUNNER_TEMP/pu120-v3"`, then use `cmp` against the four checked-in candidates. The workflow retains `contents: read`, uploads no artifacts, and changes no approval field.

- [ ] **Step 3: Run every private gate locally**

```powershell
python -m compileall -q scripts/glyphs
python -m unittest scripts.glyphs.test_build_core120_asset_handoff_v3 -v
python scripts/glyphs/validate_basic_glyph_atlas.py source/glyph-mapping/basic-single-word-glyphs.v0.1.json work/magic-glyphs/sitelen-seli-kiwen-mono-juniko/background-independent/basic-single-word/v001
python scripts/glyphs/validate_pu120_glyph_atlas.py source/glyph-mapping/pu-120-glyph-catalog.v0.2.json work/magic-glyphs/sitelen-seli-kiwen-mono-juniko/background-independent/pu120/v001
python scripts/glyphs/validate_surface_composites_v2.py source/glyph-mapping/pu-120-glyph-catalog.v0.2.json work/magic-glyphs/sitelen-seli-kiwen-mono-juniko/background-independent/pu120/v001/manifests/pu120-glyph-atlas.v0.1.json source/surface-profiles/magic-glyph-surface-profiles.v0.2.json
git diff --check
```

Expected: PASS with 14 basic glyphs, 120 unique Core-120 glyphs, 960 frames, four surfaces, and zero approval-state change.

- [ ] **Step 4: Prepare authorization-gated private commit and push**

After user authorization only:

```powershell
git add -- requirements-ci.txt scripts/glyphs/build_core120_asset_handoff_v3.py scripts/glyphs/test_build_core120_asset_handoff_v3.py manifests/releases/runtime-core120-private-export.v0.3.review-candidate.json manifests/releases/pu120-release-gate.v0.3.review-candidate.json work/runtime-candidates/pu120-v3/pu120-glyph-atlas.v0.2.json work/runtime-candidates/pu120-v3/pu120-glyph-palettes.v0.1.json .github/workflows/verify-assets.yml README.md docs/superpowers/plans/2026-08-20-private-asset-ci.md
git commit -m "assets: add glyph-only core120 handoff v0.3"
git push origin codex/glyph-activation-assets-v0.1
```

Do not mark private PR #1 ready or merge it without separate user authorization and real human approval records.
