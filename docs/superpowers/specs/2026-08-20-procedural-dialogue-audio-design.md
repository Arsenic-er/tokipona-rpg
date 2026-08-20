# Procedural Dialogue Audio and Speechless Curriculum Design

**Status:** Approved for implementation on 2026-08-20

## Goal

Remove recorded pronunciation and human speech from the RPG's launch requirements. NPC dialogue uses short, procedural pixel-style blips that carry no language or gameplay meaning. P0 and Core-120 learning continue to be proven by world context, glyph recognition, semantic discrimination, misconception repair, and active construction.

## Decisions

- The game does not require a human speaker, voice actor, pronunciation pack, TTS, ASR, or voice-cloning consent.
- The launch curriculum has no listening-comprehension or spoken-pronunciation requirement.
- NPC dialogue remains fully captioned. Audio is optional feedback and never an authority for progress, rewards, branching, evidence, or accessibility.
- Dialogue blips are synthesized in the browser after an explicit dialogue interaction. No dialogue audio file is exported from the private asset repository.
- Glyph source, license, pixel, animation, accessibility, language, community, and hash approvals remain strict release gates.
- The observed playtest cohort remains a strict final release gate.

## Non-goals

- Character voice acting, recorded words, sentences, songs, or cut-scene speech.
- Pronunciation grading or claims that the generated blips represent toki pona phonemes.
- TTS, ASR, speaker identification, voice cloning, or ML training.
- Music and environmental sound asset pipelines. Those may use separate private manifests later.
- Weakening glyph approval, semantic review, save integrity, three-hour acceptance, or cohort requirements.

## Curriculum contract migration

### P0

`data/language/p0-curriculum.v0.1.yaml` keeps its semantic content version and replaces `all_words_have_pronunciation_audio: required` with an explicit speechless policy:

```yaml
audio_policy:
  spoken_pronunciation_required: false
  dialogue_feedback: procedural_nonsemantic
  progress_may_depend_on_audio: false
  captions_required: true
```

The compiler and runtime reader require all four exact values. The P0 learning contract still requires twelve recoverable words, two contexts per word, one misconception repair, non-color and non-slot cues, and community semantic review.

### Core-120

`data/language/glyph-progression.v0.1.yaml` keeps its semantic content version and replaces `pronunciation_audio_required: true` with the same exact `audio_policy`. `accessibility.pronunciation_audio` is removed and replaced by `accessibility.dialogue_audio_optional: true` and `accessibility.captions_required: true`.

Each Core-120 word's `assetBindings` contains only `glyphAssetId`. Generated learning packages and post-Core-120 admission contracts likewise stop requiring `pronunciationAssetId` or a pronunciation review receipt. Semantic and glyph reviews remain separate and mandatory.

Audio-policy changes are non-semantic. Existing learning evidence, word states, content-version identities, action IDs, idempotency keys, and save partitions remain valid. The generated source digest changes, while the semantic learning digest remains compatible with the current contract.

## Public and private asset boundary

### Public repository

- Delete `src/assets/p0-pronunciation-manifest.v0.1.json` and its reader paths.
- Remove the pronunciation destination root, `pronunciation_audio` role, exact 120-file check, and Core-120/P0 cross-check from the current release gate.
- Remove `audio.pronunciation.*`, `audioReady`, `audioPublicPath`, and `pronunciationAudio` from runtime and UI DTOs.
- P0 and Core-120 asset readiness depends on approved glyph files, the approved glyph catalog, privacy checks, and their existing human approvals.
- Public boundary tests reject reintroduction of pronunciation asset IDs, pronunciation manifests, or files below `public/assets/pronunciation`.

### Core-120 glyph handoff v0.3

`tokipona.pu120-private-asset-export.v0.3` is glyph-only. Each entry contains exactly `glyph`; it never contains `pronunciation` or a nullable audio placeholder. The root statuses remain `missing`, `review_candidate`, and `approved`.

The public reader rejects v0.2 approved exports after the migration because they assert a launch contract that no longer exists. The checked-in public placeholder becomes a v0.3 `missing` document. A v0.3 approved export proves only the six allowlisted glyph runtime files and their exact per-word frames.

### Private repository

A new private Core-120 handoff generator and release-candidate manifest use schema v0.3 and omit all pronunciation fields. The verified glyph bytes keep their existing public `assets/magic-glyphs/pu120-v2/` paths; the schema advances because the handoff contract becomes glyph-only, not because the glyph bundle moves. No audio directory, speaker record, consent record, or audio approval is added. Existing private glyph candidates remain draft until their real approvals are recorded.

## Procedural dialogue audio contract

Create `data/audio/procedural-dialogue.v0.1.yaml` and project it into the generated runtime artifact through a strict reader. The canonical policy is:

```yaml
schema_version: audio.procedural-dialogue.v0.1
semantic_content: none
external_asset_required: false
progress_may_depend_on_audio: false
captions_required: true
explicit_interaction_only: true
cadence:
  short_note_count: [2, 3]
  long_note_count: [4, 6]
  note_duration_ms: 32
  gap_ms: 46
  maximum_sequence_ms: 600
synthesis:
  frequency_range_hz: [180, 520]
  maximum_gain: 0.03
  waveforms: [square, triangle]
  attack_ms: 4
  release_ms: 8
```

The compiler, projector, and runtime reader reject unknown fields, reordered or missing enums, non-finite values, out-of-range frequencies or gain, a sequence longer than 600 ms, and any path, URL, filename, base64 payload, phoneme, word ID, text, or external asset binding.

## Runtime architecture

### Pure sequence planner

`src/audio/procedural-dialogue-blip.ts` consumes only:

```ts
type DialogueBlipRequest = Readonly<{
  speakerId: string;
  cadence: "short" | "long";
}>;
```

It returns an immutable schedule of waveform, frequency, start offset, duration, attack, release, and gain. A stable non-cryptographic hash of `speakerId` creates a recognizable voice profile. Exact dialogue text, topic, word IDs, facts, quest state, rewards, and semantic action IDs are not inputs. Cadence conveys only approximate visual dialogue length.

The planner is deterministic, finite, bounded by the verified manifest, and has no DOM or Web Audio dependency.

### Browser audio adapter

`src/audio/browser-dialogue-audio.ts` owns `AudioContext` creation through an injected narrow interface. It:

- starts only after an accepted user-initiated talk or clarification command;
- schedules the verified plan with oscillator and gain nodes;
- uses a short attack/release envelope to avoid clicks;
- returns a no-op result if muted, unsupported, suspended without recovery, or the document is hidden;
- never throws into the game command path;
- stops and disconnects nodes after the sequence;
- stores only the user's enabled/muted preference under a versioned local key.

The default is enabled because playback is explicit-interaction-only. The dialogue panel includes an accessible toggle with `aria-pressed`; captions are always present and unchanged when audio is disabled.

### RPG integration

An accepted `BrowserPort.talk` result renders the existing structured dialogue, classifies one or two facts as `short` and three or more as `long`, then asks the audio adapter to play the NPC's profile. Rejected, replayed-on-load, initial render, background-frame, and non-dialogue actions never produce sound.

Clarification buttons use the same path. Audio never writes `GameSession`, telemetry learning evidence, WAL, receipts, world flags, or task state.

## Accessibility and privacy

- Captions remain the complete and authoritative dialogue representation.
- Muting audio does not disable controls or change any outcome.
- The sound does not encode words, topics, correct answers, danger, rewards, or speaker identity outside the fictional NPC ID.
- No microphone permission is requested.
- No audio is recorded, uploaded, cached as a binary asset, or sent over the network.
- Volume is bounded at gain `0.03`; total playback is bounded at 600 ms per explicit interaction.
- Browser audio failure is silent and recoverable.

## Verification

### Contract tests

- P0 and Core-120 generated manifests expose the exact speechless policy.
- Every Core-120 and extension word has a glyph binding and no pronunciation binding.
- Runtime readers reject legacy or tampered pronunciation fields and invalid procedural-audio parameters.
- Public asset gates require no pronunciation directory and still fail closed on glyph approval or privacy errors.
- Private v0.3 candidates contain no audio fields or paths.

### Planner and adapter tests

- Same speaker/cadence produces the same immutable plan.
- Different speakers have bounded distinct profiles.
- Short and long cadence respect exact count and duration limits.
- Every frequency, gain, offset, and duration is finite and within the manifest.
- Muted, hidden, unsupported, and failed contexts are no-op and never affect the caller.
- Fake Web Audio nodes receive the expected attack/release schedule and are disconnected.

### UI and end-to-end tests

- Accepted talk and clarification trigger one plan; rejected commands and reload trigger none.
- The mute control is keyboard accessible, persists, and never hides captions.
- Static boundary tests prove the browser command cannot provide frequency, gain, waveform, text, word IDs, or gameplay overrides.
- Full `content:check`, `assets:check`, typecheck, unit tests, production build, bundle budget, browser E2E, and deterministic three-hour acceptance pass.
- `release:check` continues to fail until glyph approval and a nonempty observed cohort exist; missing speech no longer appears as a reason.

## Rollout and compatibility

1. Land the public contract and runtime migration together so generated content never has an intermediate mixed state.
2. Land the private v0.3 glyph candidate update separately in the private repository and keep its PR draft.
3. Do not copy private glyph files until human approvals pass.
4. Existing saves load unchanged because no pronunciation state was persisted.
5. Existing browser storage gains only a versioned mute preference; missing preference uses the enabled default.
6. Remove obsolete pronunciation documentation and release blockers from completion reports while retaining glyph and cohort blockers.

## Acceptance

This change is complete only when the repositories contain no launch pronunciation requirement or pronunciation runtime asset, procedural dialogue audio is bounded and non-semantic, all existing learning and persistence gates remain green, the public/private boundary is preserved, and release readiness still requires approved glyphs plus observed cohort evidence.
