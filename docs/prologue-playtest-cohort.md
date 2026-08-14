# Prologue playtest cohort gate

This gate evaluates anonymized, observed playtest summaries against the authored
three-hour prologue thresholds. It does not generate samples, infer human
participation, or treat the deterministic acceptance runner as playtest data.

## Collect a browser sample

Open `rpg.html` and play normally. The browser stores an aggregate-only,
checksummed observation beside the GameSession save under
`tokipona.rpg.prologue.v0.3.telemetry.playtest`. Save, reload, `pagehide`, and
companion-first recovery flush this observation without copying the event ledger
or any raw utterance, player identifier, inventory lot ID, or save payload into
the telemetry record.

After at least 180 content-active minutes, choose **导出实测样本**. Export is
fail-closed when the observation is corrupt, belongs to a different ledger
prefix, started after measurable play had already occurred, or still contains
an unresolved user-visible failure. The downloaded file is a valid cohort
envelope containing one pseudonymous sample. Paused, idle, settings, and
optional free-roam time do not count toward the 180-minute threshold.

Combine the `samples` arrays from independently exported envelopes, keep one
unique pseudonymous `sessionId` per participant, and choose a new semantic
`cohortId`. Do not replace `collectionMode` or add identifying metadata.

## Evaluate a cohort

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
