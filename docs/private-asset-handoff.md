# Private asset handoff

The public repository never treats a copied file, a local path, or a manually edited status as an
approval. Runtime glyph and pronunciation assets have two valid states only:

- `safe_blocked_pending_external_approval`: the checked-in default. No private export is present,
  all runtime readiness flags remain blocked, and no pronunciation media is public.
- `approved_runtime_assets_verified`: every private review is approved, public metadata is
  internally consistent, and every declared runtime file exists with the declared SHA-256 digest.

Partial approval is invalid. The runtime remains blocked until the entire handoff is verifiable.

## Private repository audit

Run the release gate against an explicit private asset root and manifest. These commands only emit
public-safe reason codes and aggregate metadata; they must not print private source paths.

```powershell
pnpm run assets:release audit `
  --asset-root C:\absolute\private-asset-root `
  --manifest manifests\pu120-release.yaml `
  --public-root C:\absolute\toki-pona

pnpm run assets:release dry-run `
  --asset-root C:\absolute\private-asset-root `
  --manifest manifests\pu120-release.yaml `
  --public-root C:\absolute\toki-pona
```

`--manifest` is always resolved relative to `--asset-root`; absolute manifest paths and paths that
escape the private asset root are rejected.

The audit must verify source, license, language, pixel, animation, accessibility, community, hash,
and redistribution approvals. A denied or incomplete audit is a terminal result for that handoff;
do not copy files manually to bypass it.

## Export public runtime files

After the dry run is allowed, export the allowlisted runtime files atomically:

```powershell
pnpm run assets:release export `
  --asset-root C:\absolute\private-asset-root `
  --manifest manifests\pu120-release.yaml `
  --public-root C:\absolute\toki-pona
```

The exporter may copy only approved runtime roles and extensions. Source fonts, review images,
engineering files, private paths, symlinks, and unapproved licenses remain private.
The current public Core-120 contract admits exactly the six-file v0.2 glyph bundle (atlas manifest,
palette manifest, two activation pages, one role-pattern page, and one inner-edge page) plus a
separate atomic set of 120 pronunciation files. Extra masks, animations, review renders, or other
runtime roles require an explicit public schema/version change before handoff; allowlisting a
private role alone does not make it part of this release.

Glyph and pronunciation media use separate, atomic manifests. The v0.2 glyph manifest declares
`destination_root: magic_glyphs` and `destination: pu120-v2`; its approved export contains only the
six files documented in `public/assets/magic-glyphs/README.md`. The pronunciation manifest must
declare the fixed pronunciation root and a flat target set:

```yaml
public_export:
  destination_root: pronunciation
  destination: .
  files:
    - role: pronunciation_audio
      source: runtime/pronunciation/telo.ogg
      target: telo.ogg
      sha256: <64 lowercase hex characters>
```

Only `.ogg` pronunciation files are admitted, and every public target must be exactly
`<lowercase-word-id>.ogg`. Audio cannot be exported through the glyph root, glyph roles cannot be
exported through the pronunciation root, and one manifest cannot span both roots. Put all 120
approved pronunciation entries in the pronunciation manifest so the whole audio set is installed
atomically. The later `assets:check` gate still requires the exact 120-file set and verifies every
file against the public core-120 and P0 metadata.

The approved private pipeline must also provide the corresponding public metadata updates:

- `src/assets/runtime-core120-private-export.v0.2.json`
- `src/assets/runtime-release-contract.v0.1.json`
- `src/assets/p0-pronunciation-manifest.v0.1.json`
- the approved `data/language/pu-120-glyph-catalog.v0.2.json`, followed by regenerated content

Those files are public attestations, not substitutes for the private review records. Do not invent
approval values in this repository. The P0 pronunciation subset must match the same paths and hashes
declared by the core-120 export.

## Public repository verification

Regenerate the runtime artifact, then run the release gates:

```powershell
pnpm run content:generate
pnpm run assets:check
pnpm run verify
```

`assets:check` verifies the approved catalog projection, release decision, privacy flags, exact
public file sets, the glyph atlas hash, all 120 pronunciation hashes, and the P0/core-120 metadata
cross-check. It emits `approved_runtime_assets_verified` only when all evidence agrees. Otherwise it
fails closed or, for the intentional no-export state, emits
`safe_blocked_pending_external_approval`.

The ordinary `verify` command intentionally accepts that safe blocked state so code can continue to
ship through CI without private assets. It is not a production-release approval. Once an anonymized
observed cohort has also been collected, run the stricter final gate:

```powershell
pnpm run release:check -- .\private-input\prologue-cohort.json
```

`release:check` first reruns the deterministic three-hour scenarios, then requires
`approved_runtime_assets_verified` and an accepted, nonempty observed cohort. The current checked-in
state must fail this command with `approved_runtime_assets_required`; do not weaken that result.

Remote push and release tagging remain separate approval-gated operations. Never push the private
asset repository or its review/source material through the public code workflow.
