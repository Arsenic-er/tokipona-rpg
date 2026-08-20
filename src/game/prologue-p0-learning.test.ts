import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import { commitSessionProposal, type SessionProposalBatch } from "../session/adapters";
import { GameSession, replayGameSession, type GameSessionEvent } from "../session/game-session";
import { materializeP0LearningEvidence, p0TargetReached, type P0LearningActionId } from "./p0-learning-contract";
import { PrologueSettlementSession, createPrologueSettlementInitialSession } from "./prologue-settlement";
import { PrologueFlowSession } from "./prologue-flow";

const manifest = readRuntimeP0CurriculumManifest(generated);

const atArchive = (suffix: string): PrologueSettlementSession => {
  const target = new PrologueSettlementSession(createPrologueSettlementInitialSession({ sessionId: `p0.learning.${suffix}` }));
  for (let tick = 0; tick < 760 && target.snapshot().runtime.player.position.x < 608; tick += 1) target.advanceTicks(1, { moveX: 1 });
  expect(Math.abs(target.snapshot().runtime.player.position.x - 608)).toBeLessThanOrEqual(16);
  return target;
};

describe("PrologueP0LearningCoordinator", () => {
  it("rejects ordinary forged P0 evidence and remote semantic commands", () => {
    const remote = new PrologueSettlementSession(createPrologueSettlementInitialSession({ sessionId: "p0.learning.remote" }));
    expect(remote.commitP0LearningAction("p0.kon.discover", "remote")).toMatchObject({ accepted: false, reason: "too_far" });

    const session = remote.session;
    const evidence = materializeP0LearningEvidence(manifest, session.sessionId, "p0.kon.discover")[0]!;
    const batch: SessionProposalBatch = { transactionId: "forged", drafts: [{ eventId: "forged.p0", type: "learning_evidence_committed",
      payload: { evidence, p0CurriculumActionId: "p0.kon.discover", p0EvidenceOrdinal: 0 } }] };
    expect(commitSessionProposal(session, batch)).toMatchObject({ committed: false, reason: "invalid_event" });
    expect(session.forkForProposal().apply({ ...batch.drafts[0], sequence: 1 } as GameSessionEvent)).toMatchObject({ applied: false, reason: "invalid_event" });
  });

  it("reaches the exact 12-word ceiling through recovery, two contexts and repair", () => {
    const target = atArchive("matrix");
    for (const wordId of manifest.scope.wordIds) {
      const actions = ["discover", "attune", "context_0", "context_1", "repair"] as const;
      for (const [index, kind] of actions.entries()) {
        const actionId = `p0.${wordId}.${kind}` as P0LearningActionId;
        const result = target.commitP0LearningAction(actionId, `matrix.${wordId}.${index}`);
        expect(result, `${actionId}:${result.reason}`).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
      }
      const progress = target.snapshot().session.learning.words[wordId]!;
      expect(p0TargetReached(manifest.words[wordId].targetState, progress.learningState, progress.attunementState), wordId).toBe(true);
      expect(progress.evidence.length, wordId).toBeGreaterThanOrEqual(5);
      expect(progress.demonstratedSemanticFacets, wordId).toEqual(expect.arrayContaining(manifest.words[wordId].targetState === "attuned" ? [] : [...manifest.words[wordId].semanticFacets]));
    }
    expect(target.commitP0LearningAction("p0.kon.context_0", "matrix.kon.duplicate")).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    const beforeReset = target.snapshot().session.learning;
    expect(target.resetArea("matrix.reset")).toMatchObject({ accepted: true });
    expect(target.snapshot().session.learning).toEqual(beforeReset);

    const loaded = GameSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    for (const wordId of manifest.scope.wordIds) {
      const progress = loaded.snapshot().learning.words[wordId]!;
      expect(p0TargetReached(manifest.words[wordId].targetState, progress.learningState, progress.attunementState), wordId).toBe(true);
      expect(loaded.snapshot().receiptIndex[`learning:${loaded.sessionId}:p0-action:p0.${wordId}.repair`]).toBeDefined();
    }
  });

  it("enforces step prerequisites and exact evidence ordinals on replay", () => {
    const target = atArchive("ordering");
    expect(target.commitP0LearningAction("p0.seli.context_0", "early.context")).toMatchObject({ accepted: false, reason: "prerequisite_missing" });
    expect(target.commitP0LearningAction("p0.seli.attune", "early.attune")).toMatchObject({ accepted: false, reason: "prerequisite_missing" });
    expect(target.commitP0LearningAction("p0.seli.discover", "discover")).toMatchObject({ accepted: true });
    expect(target.commitP0LearningAction("p0.seli.attune", "attune")).toMatchObject({ accepted: true });
    const save = structuredClone(target.toSave()) as any;
    const evidenceEvent = save.eventLedger.find((event: GameSessionEvent) => event.type === "learning_evidence_committed" && event.payload.p0CurriculumActionId === "p0.seli.discover");
    evidenceEvent.payload.p0EvidenceOrdinal = 1;
    expect(replayGameSession(save.sessionId, save.origin, save.eventLedger)).toMatchObject({ ok: false, reason: "invalid_event" });
  });

  it("exposes only semantic actions through the formal Flow boundary", () => {
    const source = createPrologueSettlementInitialSession({ sessionId: "p0.learning.flow" });
    const flow = PrologueFlowSession.fromSave(source.toSave());
    for (let tick = 0; tick < 760 && !flow.p0LearningView().station.inRange; tick += 1) flow.advanceTicks(1, { moveX: 1 });
    expect(flow.p0LearningView()).toMatchObject({ mode: "settlement", reachedWordCount: 0,
      station: { targetId: "settlement.p0_inscription_archive", inRange: true },
      externalAssets: { approvedGlyphRelease: "blocked_pending_private_approval" } });
    expect(flow.performP0LearningAction("flow.discover", "p0.weka.discover")).toMatchObject({ accepted: true, result: { accepted: true } });
    expect(flow.p0LearningView().words.find((word) => word.wordId === "weka")).toMatchObject({ currentState: "discovered", nextActionId: "p0.weka.attune" });
  });
});
