# Core-120 Multi-page Asset Handoff v0.2

> Historical design only. The pronunciation-bearing v0.2 handoff was superseded on 2026-08-20 by
> `2026-08-20-procedural-dialogue-audio-design.md`. The active v0.3 handoff is glyph-only; this file
> remains solely as an implementation-history record and is not a release requirement.

**Status:** Approved on 2026-08-20

## Goal

Replace the fictional single-atlas Core-120 handoff with a fail-closed contract that describes the private repository's real two-page activation atlas, role-pattern page, inner-edge page, palette manifest, and exact per-word frame coordinates. The private repository may generate a deterministic review candidate, but only human-reviewed evidence may promote it to `approved`.

## Current mismatch

- The public reader expects one file: `assets/magic-glyphs/pu120-atlas.v2.png`.
- The private build produces two 1024x1024 activation pages, one role-pattern page, one inner-edge page, a palette manifest, and a coordinate manifest.
- The private license record has file hashes and `OFL-1.1`, but its authoritative source URL and redistribution approval are still pending.
- No Core-120 pronunciation audio exists in the private repository.

The existing v0.1 `missing` placeholder remains readable for migration. A v0.1 `approved` export is rejected because that shape cannot describe the real bundle.

## Public schema

`tokipona.pu120-private-asset-export.v0.2` has three statuses:

- `missing`: no candidate data and no runtime claims.
- `review_candidate`: complete glyph metadata and hashes, pending human approvals, and `null` pronunciation entries.
- `approved`: the same glyph data plus 120 approved pronunciations and every required approval set to `approved`.

The root contains `schemaVersion`, `status`, `manifestDigest`, `corpusId`, `wordIds`, `glyphBundle`, `entries`, and `privacy`.

`glyphBundle` contains the bundle identity, source/license metadata, eight approval statuses, an atlas manifest, a palette manifest, two activation pages, one role-pattern page, and one inner-edge page. Runtime file records contain `publicPath`, dimensions, SHA-256, and a page index where applicable. Paths are rooted below `assets/magic-glyphs/pu120-v2/`.

Each word entry contains an optional pronunciation plus exact glyph metadata: generated glyph asset ID, display codepoint, eight activation rectangles, one role-pattern rectangle, and one inner-edge rectangle.

The reader requires exactly the 120 generated curriculum words in generated order, exact asset bindings and codepoints, eight 32x32 activation frames, in-bounds coordinates, valid page references, unique rectangles, exact page counts and dimensions, SHA-256 values, and all privacy booleans `false`.

## Private candidate generation

`scripts/glyphs/build_core120_asset_handoff_v2.py` consumes the public runtime artifact plus the private catalog, atlas/palette manifests, license record, repository root, and output directory. It verifies declared hashes and frame coordinates before writing deterministic files:

- `work/runtime-candidates/pu120-v2/pu120-glyph-atlas.v0.2.json`
- `work/runtime-candidates/pu120-v2/pu120-glyph-palettes.v0.1.json`
- `manifests/releases/runtime-core120-private-export.v0.2.review-candidate.json`
- `manifests/releases/pu120-release-gate.v0.2.review-candidate.json`

The safe export has no private paths, source font, review media, or binary data. The release-gate candidate stays private and maps private-relative source files to future public filenames. The generator always writes `review_candidate`, `runtime_ready: false`, and pending approvals. It has no approval flag or approval code path.

## Trust and release rules

- File hashes prove deterministic identity, not human approval.
- Approval cannot be inferred from file existence or successful validation.
- Empty or unverified source URLs remain pending and keep the gate closed.
- Missing pronunciation blocks all 120 words.
- The checked-in public repository contains only a `missing` placeholder and no glyph binaries.
- An approved public boundary verifies every runtime file hash, exact file set, and exported atlas coordinates before reporting readiness.
- Unknown fields, private paths, page mismatches, coordinate overlap, hash mismatches, partial approvals, and partial pronunciation fail closed.

## Runtime projection

Existing audio/glyph readiness booleans and the derived frame ID remain for compatibility. Approved glyphs additionally expose palette/page paths and exact activation/pattern/edge rectangles. Review candidates never become renderable.

## External blockers

This work does not fabricate the upstream font source URL, redistribution approval, pixel/animation/language/accessibility/community/hash reviews, 120 licensed OGG pronunciation files, or observed playtest evidence. They remain release blockers.
