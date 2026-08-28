# Private asset handoff

The public repository never treats a copied file, a local path, or a manually edited status as an
approval. Runtime glyph assets have two valid states only:

- `safe_blocked_pending_external_approval`: the checked-in default. No private export is present
  and all runtime readiness flags remain blocked.
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
The current public Core-120 v0.3 contract admits exactly the six-file glyph bundle: an atlas
manifest, a palette manifest, two activation pages, one role-pattern page, and one inner-edge page.
It declares `destination_root: magic_glyphs` and `destination: pu120-v2`; the version change is in
the handoff schema, not the public glyph paths. Extra masks, animations, review renders, or other
runtime roles require an explicit public schema/version change before handoff. Allowlisting a
private role alone does not make it part of this release.

The private release manifest has one atomic public export:

```yaml
public_export:
  destination_root: magic_glyphs
  destination: pu120-v2
  files:
    - role: glyph_atlas_manifest
      source: runtime/pu120-v2/pu120-glyph-atlas.v0.2.json
      target: pu120-glyph-atlas.v0.2.json
      sha256: <64 lowercase hex characters>
```

The complete manifest lists exactly the six files documented in
`public/assets/magic-glyphs/README.md`. Recorded speech, pronunciation files, TTS output, speaker
records, and any other audio are outside this handoff. NPC dialogue feedback is synthesized in the
browser from the checked-in nonsemantic procedural contract; it is not a private asset export and
never affects curriculum progress.

The approved private pipeline must also provide the corresponding public metadata updates:

- `src/assets/runtime-core120-private-export.v0.3.json`
- `src/assets/runtime-release-contract.v0.1.json`
- the approved `data/language/pu-120-glyph-catalog.v0.2.json`, followed by regenerated content

Those files are public attestations, not substitutes for the private review records. Do not invent
approval values in this repository. The v0.3 export contains exactly one glyph binding per Core-120
word and rejects legacy audio or pronunciation fields.

## Public repository verification

Regenerate the runtime artifact, then run the release gates:

```powershell
pnpm run content:generate
pnpm run assets:check
pnpm run verify
```

`assets:check` verifies the approved catalog projection, release decision, privacy flags, exact
public glyph file set, atlas hash, and Core-120 metadata cross-check. It emits
`approved_runtime_assets_verified` only when all evidence agrees. Otherwise it fails closed or,
for the intentional no-export state, emits
`safe_blocked_pending_external_approval`.

The ordinary `verify` command is not a production-release approval. It currently
also stops at the nonzero three-hour certification gate with
`underground_handoff_required`, because the authored N07 return requires an
unimplemented underground allocation/epilogue runtime handoff. Focused unit
coverage of that fail-closed boundary is not completed certification and does
not authorize human or public release. Once the runtime handoff and an
anonymized observed cohort exist, run the stricter final gate:

```powershell
pnpm run release:check -- .\private-input\prologue-cohort.json
```

`release:check` first runs the release-facing three-hour certification. The
current checked-in state must fail at that predecessor with
`underground_handoff_required`; it does not currently reach asset or cohort
evaluation. After the underground runtime handoff is implemented, it will also
require `approved_runtime_assets_verified` and an accepted, nonempty observed
cohort. Do not weaken either readiness result.

Remote push and release tagging remain separate approval-gated operations. Never push the private
asset repository or its review/source material through the public code workflow.
