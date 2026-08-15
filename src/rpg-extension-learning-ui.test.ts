import { describe, expect, it } from "vitest";
import type {
  ExtensionLearningActionView,
  ExtensionLearningRuntimeView,
} from "./learning/extension-learning-runtime";
import {
  deriveExtensionLearningUiModel,
  resolveExtensionLearningUiIntent,
} from "./rpg-extension-learning-ui";

const action = (kind: ExtensionLearningActionView["kind"], index: number,
  completed = false, available = index === 0): ExtensionLearningActionView => Object.freeze({
  corpusId: "csp-tier1-rehearsal.v1",
  wordId: "testword",
  actionId: `csp1.testword.${kind}`,
  kind,
  sceneId: "scene.valley.settlement",
  targetId: `settlement.target.${index}`,
  sourceObjectClass: "inert_learning_station",
  completed,
  prerequisitesSatisfied: index === 0,
  inAuthorityScene: true,
  inRange: available,
  available,
});

const view = (): ExtensionLearningRuntimeView => {
  const actions = Object.freeze([
    action("discover", 0), action("attune", 1), action("context_0", 2),
    action("context_1", 3), action("repair", 4),
  ]);
  return Object.freeze({
    enabled: true,
    activeSceneId: "scene.valley.settlement",
    runtimeAuthorityAvailable: true,
    admittedCorpusCount: 1,
    completedWordCount: 0,
    totalWordCount: 1,
    corpora: Object.freeze([Object.freeze({
      corpusId: "csp-tier1-rehearsal.v1",
      contentVersion: "csp-tier1.rehearsal.1",
      completedWordCount: 0,
      totalWordCount: 1,
      words: Object.freeze([Object.freeze({ wordId: "testword", targetState: "produced" as const,
        currentState: "unknown" as const, completed: false, actions })]),
    })]),
  });
};

describe("extension learning semantic UI boundary", () => {
  it("emits only an available corpus/action identity", () => {
    const model = deriveExtensionLearningUiModel(view());
    expect(model).toMatchObject({ visible: true, runtimeAuthorityAvailable: true,
      completedWordCount: 0, totalWordCount: 1 });
    expect(resolveExtensionLearningUiIntent(
      model, "csp-tier1-rehearsal.v1", "csp1.testword.discover"))
      .toEqual({ kind: "perform_extension_learning_action",
        corpusId: "csp-tier1-rehearsal.v1", actionId: "csp1.testword.discover" });
    expect(resolveExtensionLearningUiIntent(
      model, "csp-tier1-rehearsal.v1", "csp1.testword.attune")).toBeNull();
  });

  it("fails closed without runtime authority or with inconsistent counters", () => {
    const unavailable = deriveExtensionLearningUiModel({ ...view(), runtimeAuthorityAvailable: false });
    expect(unavailable.visible).toBe(true);
    expect(resolveExtensionLearningUiIntent(
      unavailable, "csp-tier1-rehearsal.v1", "csp1.testword.discover")).toBeNull();
    expect(deriveExtensionLearningUiModel({ ...view(), completedWordCount: 1 }).visible).toBe(false);
  });

  it("contains no session, receipt, position or bridge authority fields", () => {
    const serialized = JSON.stringify(view());
    expect(serialized).not.toMatch(/session|receipt|position|runtimeBridge|worldRevision|payloadHash/i);
  });
});
