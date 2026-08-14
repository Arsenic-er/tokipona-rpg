import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest, type Core120ActionKind } from "../content/runtime-core120-curriculum-manifest";
import {
  CORE120_CAMPAIGN_SAVE_SCHEMA,
  applyCore120LearningAction,
  computeCore120CampaignIntegrity,
  createCore120CampaignState,
  isCore120WordComplete,
  isVerifiedCore120CampaignState,
  listCore120LearningActionIds,
  readCore120CampaignState,
  summarizeCore120Campaign,
  toCore120CampaignSave,
  type Core120CampaignState,
} from "./core120-campaign";

const manifest = readRuntimeCore120CurriculumManifest(generated);
const PLAYER_SAVE_ID = "player.save.core120.test";

function applySequence(state: Core120CampaignState, wordId: string, kinds: readonly Core120ActionKind[] = ["discover", "attune", "context_0", "context_1", "repair"]): Core120CampaignState {
  let next = state;
  for (const kind of kinds) {
    const result = applyCore120LearningAction(manifest, next, `core120.${wordId}.${kind}`);
    expect(result.reason).toBe("applied");
    expect(result.applied).toBe(true);
    next = result.state;
  }
  return next;
}

function resign(candidate: any): any {
  const body = { schema: candidate.schema, manifestDigest: candidate.manifestDigest, playerSaveId: candidate.playerSaveId, learning: candidate.learning };
  candidate.integrity = computeCore120CampaignIntegrity(body);
  return candidate;
}

describe("core-120 learning campaign", () => {
  it("exposes exactly five semantic actions for every canonical word", () => {
    const actions = listCore120LearningActionIds(manifest);
    expect(actions).toHaveLength(600);
    expect(new Set(actions).size).toBe(600);
    expect(actions.slice(0, 5)).toEqual(["core120.a.discover", "core120.a.attune", "core120.a.context_0", "core120.a.context_1", "core120.a.repair"]);
    expect(actions.slice(-5)).toEqual(["core120.wile.discover", "core120.wile.attune", "core120.wile.context_0", "core120.wile.context_1", "core120.wile.repair"]);
    expect(actions.every((action) => !/raw_|color_|fixed_slot|damage|flag/i.test(action))).toBe(true);
  });

  it("advances all 120 words through two contexts and repair to produced", () => {
    let state = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    for (const wordId of manifest.scope.wordIds) state = applySequence(state, wordId);
    expect(state.learning.revision).toBe(840);
    expect(Object.keys(state.learning.words)).toHaveLength(120);
    for (const wordId of manifest.scope.wordIds) {
      const progress = state.learning.words[wordId]!;
      expect(progress.learningState).toBe("produced");
      expect(progress.evidence).toHaveLength(7);
      expect(progress.productionTaskFamilies).toEqual([`core120.${wordId}.family_0`, `core120.${wordId}.family_1`]);
      expect(progress.evidence.filter((entry) => entry.eventType === "repair_completed")).toHaveLength(1);
      expect(isCore120WordComplete(manifest, state, wordId)).toBe(true);
    }
    expect(summarizeCore120Campaign(manifest, state)).toEqual({
      totalWords: 120,
      discoveredWords: 120,
      attunedWords: 120,
      producedWords: 120,
      repairedWords: 120,
      completedWords: 120,
      remainingSemanticActions: 0,
    });
  });

  it("fails closed on unknown actions and missing prerequisites without mutation", () => {
    const initial = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    const unknown = applyCore120LearningAction(manifest, initial, "core120.notaword.discover");
    expect(unknown).toMatchObject({ state: initial, applied: false, duplicate: false, reason: "unknown_action" });
    const earlyContext = applyCore120LearningAction(manifest, initial, "core120.a.context_0");
    expect(earlyContext).toMatchObject({ state: initial, applied: false, duplicate: false, reason: "prerequisite_missing" });
    const discovered = applyCore120LearningAction(manifest, initial, "core120.a.discover").state;
    const earlyRepair = applyCore120LearningAction(manifest, discovered, "core120.a.repair");
    expect(earlyRepair).toMatchObject({ state: discovered, applied: false, duplicate: false, reason: "prerequisite_missing" });
    expect(initial.learning.revision).toBe(0);
  });

  it("makes exact repeats stable and rejects unverified manifest or state objects", () => {
    const initial = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    const first = applyCore120LearningAction(manifest, initial, "core120.a.discover");
    const duplicate = applyCore120LearningAction(manifest, first.state, "core120.a.discover");
    expect(duplicate).toMatchObject({ state: first.state, applied: false, duplicate: true, reason: "duplicate", evidenceApplied: 0, evidenceAlreadyPresent: 1 });
    expect(duplicate.state.learning.revision).toBe(1);

    const unverifiedManifest = structuredClone(manifest);
    expect(applyCore120LearningAction(unverifiedManifest, first.state, "core120.a.attune").reason).toBe("invalid_manifest");
    const unverifiedState = structuredClone(first.state);
    expect(applyCore120LearningAction(manifest, unverifiedState, "core120.a.attune").reason).toBe("invalid_state");
  });

  it("loads JSON saves, preserves identity, and continues without duplication", () => {
    let state = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    state = applySequence(state, "a", ["discover", "attune", "context_0"]);
    const loaded = readCore120CampaignState(manifest, JSON.parse(JSON.stringify(toCore120CampaignSave(state))));
    expect(isVerifiedCore120CampaignState(loaded)).toBe(true);
    expect(loaded).toEqual(state);
    const continued = applySequence(loaded, "a", ["context_1", "repair"]);
    expect(isCore120WordComplete(manifest, continued, "a")).toBe(true);
    expect(continued.learning.revision).toBe(7);
  });

  it("forward-repairs a valid action interrupted between its two evidence writes", () => {
    let state = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    state = applySequence(state, "a", ["discover", "attune", "context_0"]);
    const partial = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    const progress = partial.learning.words.a;
    const active = progress.evidence.find((entry: any) => entry.eventType === "active_retrieval_submitted");
    progress.evidence = progress.evidence.filter((entry: any) => entry.eventId !== active.eventId);
    progress.productionTaskFamilies = [];
    progress.producedBaselineTaskFamilies = [];
    progress.producedBaselineEnvironmentFingerprints = [];
    const activeKey = Object.keys(partial.learning.processedEventPayloads).find((key) => partial.learning.processedEventPayloads[key].includes('"eventType":"active_retrieval_submitted"'))!;
    delete partial.learning.processedEventPayloads[activeKey];
    partial.learning.revision -= 1;
    const loadedPartial = readCore120CampaignState(manifest, resign(partial));

    const recovered = applyCore120LearningAction(manifest, loadedPartial, "core120.a.context_0");
    expect(recovered).toMatchObject({ applied: true, duplicate: false, repairedPartialAction: true, evidenceApplied: 1, evidenceAlreadyPresent: 1, reason: "forward_repaired" });
    expect(recovered.state.learning.words.a!.productionTaskFamilies).toEqual(["core120.a.family_0"]);
    expect(recovered.state.learning.words.a!.evidence.filter((entry) => entry.eventType === "active_retrieval_submitted")).toHaveLength(1);
  });

  it("rejects tampered, re-bound, and structurally malformed saves", () => {
    const state = applyCore120LearningAction(manifest, createCore120CampaignState(manifest, PLAYER_SAVE_ID), "core120.a.discover").state;
    const checksum = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    checksum.learning.revision = 99;
    expect(() => readCore120CampaignState(manifest, checksum)).toThrow(/integrity mismatch/);

    const rebound = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    rebound.playerSaveId = "player.save.foreign";
    expect(() => readCore120CampaignState(manifest, resign(rebound))).toThrow(/evidence identity|processed action identity/);

    const poisonedPayload = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    const key = Object.keys(poisonedPayload.learning.processedEventPayloads)[0]!;
    poisonedPayload.learning.processedEventPayloads[key] = "forged";
    expect(() => readCore120CampaignState(manifest, resign(poisonedPayload))).toThrow(/payload index|processed action identity/);

    const unknownWord = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    unknownWord.learning.words.invented = { ...unknownWord.learning.words.a, wordId: "invented" };
    expect(() => readCore120CampaignState(manifest, resign(unknownWord))).toThrow(/unknown word/);

    const malformed = JSON.parse(JSON.stringify(toCore120CampaignSave(state))) as any;
    malformed.learning.words.a.evidence = "not-an-array";
    expect(() => readCore120CampaignState(manifest, resign(malformed))).toThrow(/evidence is invalid/);
  });

  it("keeps the save schema and manifest digest explicit", () => {
    const state = createCore120CampaignState(manifest, PLAYER_SAVE_ID);
    expect(state).toMatchObject({ schema: CORE120_CAMPAIGN_SAVE_SCHEMA, manifestDigest: manifest.sourceDigest, playerSaveId: PLAYER_SAVE_ID });
    const save = toCore120CampaignSave(state);
    expect(save.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.learning)).toBe(true);
  });
});
