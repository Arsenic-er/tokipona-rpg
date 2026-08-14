# Prologue playtest cohort gate

This gate evaluates anonymized, observed playtest summaries against the authored
three-hour prologue thresholds. It does not generate samples, infer human
participation, or treat the deterministic acceptance runner as playtest data.

Run it with:

```powershell
pnpm acceptance:cohort -- .\private-input\prologue-cohort.json
```

The evaluator process sets exit code `0` when every threshold passed, `1` when
the input was valid but at least one threshold failed, and `2` when the envelope
or a sample was invalid. Package runners may normalize nonzero child exit codes.
The report contains aggregates only and does not echo session records.

The input envelope has exactly four fields:

```json
{
  "schemaVersion": "tokipona.prologue-playtest-cohort.v0.1",
  "collectionMode": "anonymized_observed_playtest",
  "cohortId": "cohort.prologue.alpha",
  "samples": []
}
```

Each sample uses schema `prologue.playtest-session.v0.1`, covers at least 180
content-active minutes, and contains only the 22 fields projected by
`playtestSessionSummary.requiredFields` in the generated runtime manifest.
Session IDs must be unique pseudonymous semantic IDs. Never include raw
utterances, raw text, inventory lot IDs, save payloads, player identifiers,
damage overrides, or world-flag overrides.

The three exclusive activity totals must add up exactly to `contentActiveMs`.
Missing discovery, recovery, permission, or signature observations fail their
corresponding percentile/proportion gate instead of being imputed. Hunting and
nonviolent income rates are computed from aggregate coin and active time; counts
are summed. The collection mode is a provenance declaration, not a signature or
cryptographic attestation of human participation.
