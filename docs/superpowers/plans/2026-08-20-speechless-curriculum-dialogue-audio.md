# Speechless Curriculum and Procedural Dialogue Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove launch pronunciation assets from every public curriculum and release boundary, then add deterministic, optional, non-semantic browser-synthesized NPC dialogue blips.

**Architecture:** A shared strict speechless-audio policy is projected into P0, Core-120, and future corpus contracts. Core-120 asset export v0.3 becomes glyph-only. A separate strict procedural-dialogue manifest drives a pure sequence planner and an injected Web Audio adapter; RPG integration calls it only after accepted user-initiated dialogue.

**Tech Stack:** TypeScript 7, YAML, generated JSON runtime artifacts, Vitest, Vite, Web Audio API, Playwright, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-20-procedural-dialogue-audio-design.md`

## Global Constraints

- Node.js remains `>=22.13 <23`; do not weaken the engine or lockfile.
- No recorded speech, pronunciation file, TTS, ASR, microphone permission, voice cloning, or audio network request may enter the public runtime.
- Captions remain complete and authoritative; audio cannot affect learning, progress, rewards, branches, receipts, WAL, save data, or telemetry evidence.
- P0 remains exactly 12 words; Core-120 remains exactly 120 words and 600 semantic actions.
- Glyph approvals, semantic review, privacy checks, deterministic three-hour acceptance, and observed cohort release gates remain strict.
- Existing GameSession saves and semantic action IDs remain compatible.
- Work in `codex/dialogue-blips`; stage and commit only after explicit user authorization.

---

### Task 1: Canonical speechless curriculum policy

**Files:**
- Create: `src/content/runtime-speechless-audio-policy.ts`
- Create: `src/content/runtime-speechless-audio-policy.test.ts`
- Modify: `data/language/p0-curriculum.v0.1.yaml`
- Modify: `data/language/glyph-progression.v0.1.yaml`
- Modify: `scripts/content/p0-runtime-artifact.ts`
- Modify: `scripts/content/core120-runtime-artifact.ts`
- Modify: `src/content/compiler.ts`
- Modify: `src/content/runtime-p0-curriculum-manifest.ts`
- Modify: `src/content/runtime-p0-curriculum-manifest.test.ts`
- Modify: `src/content/runtime-core120-curriculum-manifest.ts`
- Modify: `src/content/runtime-core120-curriculum-manifest.test.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: authored snake-case `audio_policy` objects.
- Produces: `RuntimeSpeechlessAudioPolicy` and `readRuntimeSpeechlessAudioPolicy(value, label)`.

- [ ] **Step 1: Write the failing shared-policy test**

```ts
const EXPECTED = {
  spokenPronunciationRequired: false,
  dialogueFeedback: "procedural_nonsemantic",
  progressMayDependOnAudio: false,
  captionsRequired: true,
} as const;

expect(readRuntimeSpeechlessAudioPolicy(EXPECTED, "test")).toEqual(EXPECTED);
expect(() => readRuntimeSpeechlessAudioPolicy({ ...EXPECTED, spokenPronunciationRequired: true }, "test"))
  .toThrow(/speechless audio policy/i);
expect(() => readRuntimeSpeechlessAudioPolicy({ ...EXPECTED, pronunciationAssetId: "audio.x" }, "test"))
  .toThrow(/unknown|missing/i);
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `pnpm exec vitest run src/content/runtime-speechless-audio-policy.test.ts`

Expected: FAIL because `runtime-speechless-audio-policy.ts` does not exist.

- [ ] **Step 3: Implement the exact policy reader**

```ts
export interface RuntimeSpeechlessAudioPolicy {
  readonly spokenPronunciationRequired: false;
  readonly dialogueFeedback: "procedural_nonsemantic";
  readonly progressMayDependOnAudio: false;
  readonly captionsRequired: true;
}

export function readRuntimeSpeechlessAudioPolicy(value: unknown, label: string): RuntimeSpeechlessAudioPolicy;
```

The implementation must exact-key-check the four fields, verify the four literal values, deep-freeze the returned record, and reject arrays/null/unknown fields.

- [ ] **Step 4: Replace both authored pronunciation requirements**

P0 `content_acceptance.audio_policy` and Core-120 `runtime_contract.audio_policy` must use:

```yaml
spoken_pronunciation_required: false
dialogue_feedback: procedural_nonsemantic
progress_may_depend_on_audio: false
captions_required: true
```

Remove `all_words_have_pronunciation_audio`, `pronunciation_audio_required`, and `accessibility.pronunciation_audio`. Add `accessibility.dialogue_audio_optional: true` and `accessibility.captions_required: true` to Core-120.

- [ ] **Step 5: Project and strictly read the policy**

Both projectors emit `audioPolicy`. Both runtime manifest readers call `readRuntimeSpeechlessAudioPolicy`; their public acceptance interfaces expose `audioPolicy` and contain no pronunciation field. The compiler requires the authored exact values and reports `contract.speechless_audio_policy` for tampering.

- [ ] **Step 6: Regenerate and run focused contract tests**

Run:

```powershell
pnpm run content:generate
pnpm exec vitest run src/content/runtime-speechless-audio-policy.test.ts src/content/runtime-p0-curriculum-manifest.test.ts src/content/runtime-core120-curriculum-manifest.test.ts scripts/content/core120-runtime-artifact.test.ts
```

Expected: PASS; generated JSON contains the policy twice and contains neither legacy pronunciation requirement.

- [ ] **Step 7: Prepare an authorization-gated checkpoint**

After user authorization only:

```powershell
git add -- data/language/p0-curriculum.v0.1.yaml data/language/glyph-progression.v0.1.yaml scripts/content/p0-runtime-artifact.ts scripts/content/core120-runtime-artifact.ts src/content/compiler.ts src/content/runtime-speechless-audio-policy.ts src/content/runtime-speechless-audio-policy.test.ts src/content/runtime-p0-curriculum-manifest.ts src/content/runtime-p0-curriculum-manifest.test.ts src/content/runtime-core120-curriculum-manifest.ts src/content/runtime-core120-curriculum-manifest.test.ts src/generated/content-runtime.v0.1.json
git commit -m "refactor: make launch curriculum speechless"
```

---

### Task 2: Remove pronunciation from Core-120 and expansion identities

**Files:**
- Modify: `scripts/content/core120-runtime-artifact.ts`
- Modify: `src/content/runtime-core120-curriculum-manifest.ts`
- Modify: `scripts/content/corpus-expansion-runtime-artifact.ts`
- Modify: `scripts/content/corpus-expansion-runtime-artifact.test.ts`
- Modify: `src/content/runtime-corpus-expansion-registry.ts`
- Modify: `src/content/runtime-learning-corpus-package.ts`
- Modify: `src/content/runtime-learning-corpus-package.test.ts`
- Modify: `src/learning/corpus-partition-collection.ts`
- Modify: `src/learning/corpus-partition-collection.test.ts`
- Modify: `data/language/glyph-progression.v0.1.yaml`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: word glyph binding and semantic/glyph review receipts.
- Produces: `assetBindings: { glyphAssetId }` and `reviewReceiptIds: { semantic, glyph }` everywhere.

- [ ] **Step 1: Change tests to the speechless exact shapes**

```ts
expect(word.assetBindings).toEqual({ glyphAssetId: `glyph.pu120.${word.wordId}.v2` });
expect(contract.reviewReceiptIds).toEqual({
  semantic: "review.semantic.csp1.v1",
  glyph: "review.glyph.csp1.v1",
});
expect(JSON.stringify(contract)).not.toMatch(/pronunciation|audio\.pronunciation/i);
```

Add tamper cases that inject `pronunciationAssetId` or `reviewReceiptIds.pronunciation` and expect strict rejection.

- [ ] **Step 2: Run the expansion tests and observe RED**

Run:

```powershell
pnpm exec vitest run src/content/runtime-core120-curriculum-manifest.test.ts scripts/content/corpus-expansion-runtime-artifact.test.ts src/content/runtime-learning-corpus-package.test.ts src/learning/corpus-partition-collection.test.ts
```

Expected: FAIL because current readers require pronunciation bindings and receipts.

- [ ] **Step 3: Remove pronunciation identity fields end to end**

Update these exact public types:

```ts
readonly assetBindings: Readonly<{ readonly glyphAssetId: string }>;
readonly reviewReceiptIds: Readonly<{
  readonly semantic: string;
  readonly glyph: string;
}>;
```

Change exact-key checks, distinct-receipt counts from three to two, package equality, partition collection equality, projector output, and fixtures. Remove `pronunciation_assets` from every admission requirement and blocked-reason list.

- [ ] **Step 4: Regenerate and prove the forbidden identity is absent**

Run:

```powershell
pnpm run content:generate
rg -n "pronunciationAssetId|audio\.pronunciation|review\.pronunciation|pronunciation_assets" data/language scripts/content src/content src/learning src/generated
```

Expected: `rg` exit 1 with no matches in the scoped production/runtime files.

- [ ] **Step 5: Run focused package tests**

Run the four tests from Step 2 plus `pnpm run typecheck`.

Expected: PASS.

---

### Task 3: Migrate the public asset boundary to glyph-only v0.3

**Files:**
- Delete: `src/assets/p0-pronunciation-manifest.v0.1.json`
- Modify: `src/assets/runtime-p0-assets.ts`
- Modify: `src/assets/runtime-p0-assets.test.ts`
- Modify: `src/assets/runtime-core120-assets.ts`
- Modify: `src/assets/runtime-core120-assets.test.ts`
- Modify: `src/assets/runtime-core120-private-export.v0.2.json`
- Modify: `scripts/assets/release-gate.ts`
- Modify: `scripts/assets/release-gate.test.ts`
- Modify: `scripts/assets/public-runtime-boundary.ts`
- Modify: `scripts/assets/public-runtime-boundary.test.ts`
- Modify: `scripts/assets/check-public-runtime-boundary.ts`
- Modify: `src/game/prologue-flow.ts`
- Modify: `src/rpg-p0-learning-ui.ts`
- Modify: `src/rpg-p0-learning-ui.test.ts`
- Modify: `src/rpg-core120-learning-ui.ts`
- Modify: `src/rpg-core120-learning-ui.test.ts`
- Modify: `docs/private-asset-handoff.md`

**Interfaces:**
- Consumes: glyph-only v0.3 private export and glyph release contract.
- Produces: glyph readiness with no audio fields or pronunciation file-set gate.

- [ ] **Step 1: Write glyph-only reader and UI expectations**

```ts
expect(runtimeP0AssetReadiness).toEqual({
  approvedGlyphRelease: "blocked_pending_private_approval",
  playableContentMayClaimFullAssetAcceptance: false,
});
expect(runtimeCore120AssetReadiness.pronunciationAudio).toBeUndefined();
expect(Object.values(runtimeCore120AssetReadiness.wordAssets).every((word) =>
  !("audioReady" in word) && !("audioPublicPath" in word))).toBe(true);
```

The UI tests must assert that a blocked notice names only glyph/catalog approval and never pronunciation.

- [ ] **Step 2: Write v0.3 schema and boundary negatives**

The checked-in placeholder becomes:

```json
{
  "schemaVersion": "tokipona.pu120-private-asset-export.v0.3",
  "status": "missing",
  "manifestDigest": null,
  "corpusId": "pu-120",
  "wordIds": [],
  "glyphBundle": null,
  "entries": {},
  "privacy": {
    "containsPrivatePaths": false,
    "containsPrivateAssets": false,
    "containsSourceFonts": false,
    "containsReviewMedia": false
  }
}
```

Tests inject an entry `pronunciation`, a root audio field, a `pronunciation` destination, and a `pronunciation_audio` role; all must be rejected.

- [ ] **Step 3: Run focused asset tests and observe RED**

Run:

```powershell
pnpm exec vitest run src/assets/runtime-p0-assets.test.ts src/assets/runtime-core120-assets.test.ts scripts/assets/release-gate.test.ts scripts/assets/public-runtime-boundary.test.ts src/rpg-p0-learning-ui.test.ts src/rpg-core120-learning-ui.test.ts
```

Expected: FAIL on legacy audio fields and v0.2 schema.

- [ ] **Step 4: Implement v0.3 and remove pronunciation paths**

Keep `RuntimeCore120WordAssetReadiness` glyph-only. `readV3PrivateExport` exact-key-checks each entry as `{ glyph }`. P0 readiness delegates only to `readRuntimeGlyphReleaseApproval`. The current asset release gate accepts only `magic_glyphs`; future music/SFX require a separate versioned design.

`PrologueFlowP0LearningView` and `PrologueFlowCore120LearningView` expose no audio readiness. Full asset acceptance is glyph/catalog approval only.

- [ ] **Step 5: Verify boundary and focused tests**

Run:

```powershell
pnpm run assets:check
pnpm exec vitest run src/assets/runtime-p0-assets.test.ts src/assets/runtime-core120-assets.test.ts scripts/assets/release-gate.test.ts scripts/assets/public-runtime-boundary.test.ts src/rpg-p0-learning-ui.test.ts src/rpg-core120-learning-ui.test.ts src/game/prologue-p0-learning.test.ts src/game/prologue-core120-learning.test.ts
```

Expected: PASS with intentional glyph approval blocking only.

---

### Task 4: Add the strict procedural-dialogue manifest

**Files:**
- Create: `data/audio/procedural-dialogue.v0.1.yaml`
- Create: `scripts/content/dialogue-audio-runtime-artifact.ts`
- Create: `scripts/content/dialogue-audio-runtime-artifact.test.ts`
- Create: `src/content/runtime-dialogue-audio-manifest.ts`
- Create: `src/content/runtime-dialogue-audio-manifest.test.ts`
- Modify: `scripts/content/runtime-artifact.ts`
- Modify: `scripts/content/generate-runtime.ts`
- Modify: `src/content/compiler.ts`
- Regenerate: `src/generated/content-runtime.v0.1.json`

**Interfaces:**
- Consumes: exact authored procedural dialogue parameters.
- Produces: branded `RuntimeProceduralDialogueAudioManifest` from `readRuntimeProceduralDialogueAudioManifest(generated)`.

- [ ] **Step 1: Write failing source/projector/reader tests**

```ts
expect(manifest).toMatchObject({
  semanticContent: "none",
  externalAssetRequired: false,
  progressMayDependOnAudio: false,
  captionsRequired: true,
  explicitInteractionOnly: true,
  cadence: { shortNoteCount: [2, 3], longNoteCount: [4, 6], noteDurationMs: 32, gapMs: 46,
    maximumSequenceMs: 600 },
  synthesis: { frequencyRangeHz: [180, 520], maximumGain: 0.03,
    waveforms: ["square", "triangle"], attackMs: 4, releaseMs: 8 },
});
```

Tamper source and runtime fixtures with `externalAssetRequired: true`, `maximumGain: 1`, an unknown waveform, a URL, and an extra `text` field; compile/project/read must fail closed.

- [ ] **Step 2: Run tests and observe RED**

Run:

```powershell
pnpm exec vitest run scripts/content/dialogue-audio-runtime-artifact.test.ts src/content/runtime-dialogue-audio-manifest.test.ts
```

Expected: FAIL because the new modules and generated root field are missing.

- [ ] **Step 3: Implement source, projector, compiler gate, digest, and reader**

The reader exact-key-checks every object, requires all numeric fields to be finite safe numbers, verifies derived maximum cadence duration does not exceed 600 ms, recomputes `sourceDigest`, brands the verified result in a `WeakSet`, and rejects any unverified structural lookalike.

- [ ] **Step 4: Regenerate and verify**

Run `pnpm run content:generate`, both tests from Step 2, and `pnpm run content:check`.

Expected: PASS and byte-current generated JSON.

---

### Task 5: Build the pure deterministic blip planner

**Files:**
- Create: `src/audio/procedural-dialogue-blip.ts`
- Create: `src/audio/procedural-dialogue-blip.test.ts`

**Interfaces:**
- Consumes: verified `RuntimeProceduralDialogueAudioManifest` and `DialogueBlipRequest`.
- Produces: `createDialogueBlipPlan(manifest, request): DialogueBlipPlan`.

- [ ] **Step 1: Write planner behavior and boundary tests**

```ts
const request = { speakerId: "settlement.supply_trader", cadence: "short" } as const;
const first = createDialogueBlipPlan(MANIFEST, request);
expect(createDialogueBlipPlan(MANIFEST, request)).toEqual(first);
expect(Object.isFrozen(first)).toBe(true);
expect(first.notes.length).toBeGreaterThanOrEqual(2);
expect(first.notes.length).toBeLessThanOrEqual(3);
expect(first.totalDurationMs).toBeLessThanOrEqual(600);
for (const note of first.notes) {
  expect(Number.isFinite(note.frequencyHz)).toBe(true);
  expect(note.frequencyHz).toBeGreaterThanOrEqual(180);
  expect(note.frequencyHz).toBeLessThanOrEqual(520);
  expect(note.gain).toBeLessThanOrEqual(0.03);
}
```

Also assert canonical settlement NPC IDs have pairwise-distinct note signatures, invalid/empty speaker IDs reject, and the request type/source contains no text, word, topic, frequency, gain, waveform, or progress override.

- [ ] **Step 2: Run the planner test and observe RED**

Run: `pnpm exec vitest run src/audio/procedural-dialogue-blip.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement the planner**

```ts
export interface DialogueBlipRequest {
  readonly speakerId: string;
  readonly cadence: "short" | "long";
}

export function createDialogueBlipPlan(
  manifest: RuntimeProceduralDialogueAudioManifest,
  request: DialogueBlipRequest,
): DialogueBlipPlan;
```

Use a local FNV-1a 32-bit hash of `speakerId`, deterministic bounded integer selection, alternating canonical waveforms, immutable notes, and manifest-only timing/gain. Do not import DOM, `AudioContext`, randomness, time, storage, or GameSession.

- [ ] **Step 4: Run planner tests and typecheck**

Run the planner test and `pnpm run typecheck`.

Expected: PASS.

---

### Task 6: Add the injected browser Web Audio adapter

**Files:**
- Create: `src/audio/browser-dialogue-audio.ts`
- Create: `src/audio/browser-dialogue-audio.test.ts`

**Interfaces:**
- Consumes: a verified manifest, injected audio-context factory, injected storage, and injected document visibility.
- Produces: `createBrowserDialogueAudio(options): BrowserDialogueAudio`.

- [ ] **Step 1: Write fake-context tests**

```ts
const audio = createBrowserDialogueAudio({
  manifest: MANIFEST,
  createContext: () => fakeContext,
  storage: fakeStorage,
  isDocumentVisible: () => true,
});

expect(audio.play({ speakerId: "settlement.supply_trader", cadence: "short" })).toBe(true);
expect(fakeContext.startedOscillators).toHaveLength(2);
audio.setEnabled(false);
expect(audio.play({ speakerId: "settlement.supply_trader", cadence: "short" })).toBe(false);
expect(fakeStorage.getItem(DIALOGUE_AUDIO_STORAGE_KEY)).toBe("muted");
```

Add tests for hidden documents, unavailable contexts, thrown context factories, rejected resume, oscillator creation failure, node disconnect, and corrupt storage. Every failure returns `false` without throwing.

- [ ] **Step 2: Run the adapter test and observe RED**

Run: `pnpm exec vitest run src/audio/browser-dialogue-audio.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the narrow adapter**

```ts
export const DIALOGUE_AUDIO_STORAGE_KEY = "tokipona.rpg.dialogue-audio.v0.1" as const;

export interface BrowserDialogueAudio {
  readonly enabled: boolean;
  setEnabled(value: boolean): void;
  toggle(): boolean;
  play(request: DialogueBlipRequest): boolean;
  close(): void;
}
```

Wrap every browser operation in fail-closed handling. Schedule attack, steady, and release gain ramps; call oscillator `stop`; disconnect on `ended`; never persist anything except `enabled`/`muted`.

- [ ] **Step 4: Run adapter and planner tests**

Run both `src/audio/*.test.ts` files and `pnpm run typecheck`.

Expected: PASS.

---

### Task 7: Integrate dialogue blips without semantic leakage

**Files:**
- Modify: `src/rpg-main.ts`
- Modify: `src/rpg.css`
- Create: `src/rpg-dialogue-audio-boundary.test.ts`
- Modify: `e2e/rpg-prologue.spec.ts`

**Interfaces:**
- Consumes: accepted `SettlementDialogueNode` and `BrowserDialogueAudio`.
- Produces: one optional blip sequence per accepted explicit talk/clarify interaction and an accessible mute toggle.

- [ ] **Step 1: Add static and browser-facing failing tests**

```ts
expect(RPG_SOURCE).toContain('data-ui="dialogue-audio-toggle"');
expect(RPG_SOURCE).toMatch(/dialogueAudio\.play/);
expect(RPG_SOURCE).not.toMatch(/frequencyHz:|gain:|waveform:|pronunciationAssetId/);
```

The E2E test stubs `AudioContext`, clicks an enabled settlement NPC topic, asserts oscillator start count increments once, clicks clarification and observes one more sequence, toggles mute, clicks again and observes no increment, reloads and verifies mute persistence while dialogue captions remain visible.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `pnpm exec vitest run src/rpg-dialogue-audio-boundary.test.ts`

Expected: FAIL because no audio controller or toggle is wired.

- [ ] **Step 3: Wire the accepted dialogue path**

Instantiate the adapter once after verified generated content loads. In `BrowserPort.talk`, after `result.accepted` and `renderDialogue`, call:

```ts
dialogueAudio.play({
  speakerId: result.result.node.npcId,
  cadence: result.result.node.facts.length >= 3 ? "long" : "short",
});
```

Add a dialogue-panel button with `aria-pressed`, text `对话音：开/关`, and a handler that only toggles the audio preference. Initial render, rejected talk, save load, frame rendering, and background activity never call `play`.

- [ ] **Step 4: Run focused unit and E2E tests**

Run:

```powershell
pnpm exec vitest run src/audio/procedural-dialogue-blip.test.ts src/audio/browser-dialogue-audio.test.ts src/rpg-dialogue-audio-boundary.test.ts src/game/prologue-settlement.test.ts
pnpm run build
pnpm exec playwright test e2e/rpg-prologue.spec.ts
```

Expected: PASS; captions are unchanged when muted.

---

### Task 8: Full public verification and documentation reconciliation

**Files:**
- Modify: `docs/private-asset-handoff.md`
- Modify: `docs/superpowers/specs/2026-08-20-core120-multipage-asset-handoff-v02.md`
- Modify: any acceptance report that still calls missing pronunciation a blocker, identified by the exact scans below.

**Interfaces:**
- Consumes: completed Tasks 1–7.
- Produces: a clean public feature branch whose remaining release blockers are glyph approvals and observed cohort evidence.

- [ ] **Step 1: Remove obsolete launch claims**

Run:

```powershell
rg -n "pronunciation_audio|required pronunciation|发音音频|audio\.pronunciation|p0-pronunciation|assets/pronunciation" data src scripts docs public
```

Every remaining match must either describe the historical v0.2 migration or be removed. Production contracts, UI, release reasons, and current-state documentation must have zero matches.

- [ ] **Step 2: Run the full gate**

Run:

```powershell
pnpm run content:check
pnpm run assets:check
pnpm run typecheck
pnpm run acceptance:three-hour
pnpm test
pnpm run build
pnpm run test:e2e
git diff --check
```

Expected: every command exits 0. Local Node 24 may emit the known engine warning; authoritative GitHub CI must use Node 22.

- [ ] **Step 3: Verify release blocking semantics**

Run `pnpm run release:check -- .\private-input\prologue-cohort.json` with the existing empty/non-approved fixture.

Expected: fail closed only for missing approved glyph assets and/or missing observed cohort evidence; no pronunciation reason appears.

- [ ] **Step 4: Prepare the final authorization-gated commit**

After user authorization only, inspect `git status`, stage only the files listed by Tasks 1–8, review `git diff --cached`, then:

```powershell
git commit -m "feat: replace launch speech with procedural dialogue audio"
```

Do not merge or push until the user separately authorizes those operations.
