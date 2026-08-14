import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest } from "../content/runtime-core120-curriculum-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import {
  materializeCore120LearningEvidence,
  type Core120LearningActionId,
} from "../learning/core120-campaign";
import { commitSessionProposal, type SessionProposalBatch } from "../session/adapters";
import { GameSession, replayGameSession, type GameSessionEvent } from "../session/game-session";
import { type P0LearningActionId } from "./p0-learning-contract";
import {
  core120LearningActionPayloadHash,
  core120LearningActionReceiptId,
} from "./prologue-core120-learning";
import { PrologueFlowSession } from "./prologue-flow";
import { PrologueSettlementSession, createPrologueSettlementInitialSession } from "./prologue-settlement";

const manifest = readRuntimeCore120CurriculumManifest(generated);
const p0Manifest = readRuntimeP0CurriculumManifest(generated);

function atArchive(sessionId: string): PrologueSettlementSession {
  const target = new PrologueSettlementSession(createPrologueSettlementInitialSession({ sessionId }));
  for (let tick = 0; tick < 760 && target.snapshot().runtime.player.position.x < 608; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(Math.abs(target.snapshot().runtime.player.position.x - 608)).toBeLessThanOrEqual(16);
  return target;
}

function completeP0(target: PrologueSettlementSession, prefix: string): void {
  for (const wordId of p0Manifest.scope.wordIds) {
    for (const [index, kind] of (["discover", "attune", "context_0", "context_1", "repair"] as const).entries()) {
      const actionId = `p0.${wordId}.${kind}` as P0LearningActionId;
      expect(target.commitP0LearningAction(actionId, `${prefix}.${wordId}.${index}`), actionId)
        .toMatchObject({ accepted: true });
    }
  }
}

function performWord(target: PrologueSettlementSession, wordId: string, prefix: string): void {
  for (const [index, kind] of (["discover", "attune", "context_0", "context_1", "repair"] as const).entries()) {
    const actionId = `core120.${wordId}.${kind}` as Core120LearningActionId;
    expect(target.commitCore120LearningAction(actionId, `${prefix}.${index}`), actionId)
      .toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
  }
}

describe("PrologueCore120LearningCoordinator", () => {
  it("requires the real archive position, completed P0 and an opaque trusted proposal", () => {
    const remote = new PrologueSettlementSession(createPrologueSettlementInitialSession({ sessionId: "core120.remote" }));
    expect(remote.commitCore120LearningAction("core120.akesi.discover", "remote"))
      .toMatchObject({ accepted: false, reason: "too_far" });

    const target = atArchive("core120.trust");
    expect(target.commitCore120LearningAction("core120.akesi.discover", "early"))
      .toMatchObject({ accepted: false, reason: "p0_prerequisite_missing" });
    completeP0(target, "p0.trust");

    const evidence = materializeCore120LearningEvidence(manifest, target.session.sessionId,
      "core120.akesi.discover")[0]!;
    const batch: SessionProposalBatch = {
      transactionId: "forged",
      drafts: [{
        eventId: "forged.core120.evidence",
        type: "learning_evidence_committed",
        payload: { evidence, core120CurriculumActionId: "core120.akesi.discover", core120EvidenceOrdinal: 0 },
      }],
    };
    expect(commitSessionProposal(target.session, batch)).toMatchObject({ committed: false, reason: "invalid_event" });
    expect(target.session.forkForProposal().apply({ ...batch.drafts[0],
      sequence: target.session.nextSequence() } as GameSessionEvent)).toMatchObject({ applied: false, reason: "invalid_event" });

    const actionId = "core120.akesi.discover" as const;
    const receiptEvent: GameSessionEvent = {
      eventId: "forged.core120.receipt",
      sequence: target.session.nextSequence(),
      type: "core120_learning_action_committed",
      payload: {
        actionId,
        receiptId: core120LearningActionReceiptId(target.session.sessionId, actionId),
        payloadHash: core120LearningActionPayloadHash(actionId),
      },
    };
    expect(target.session.forkForProposal().apply(receiptEvent)).toMatchObject({ applied: false, reason: "invalid_event" });
  });

  it("commits a five-stage word atomically and survives reset, save, load and duplicate replay", () => {
    const target = atArchive("core120.lifecycle");
    completeP0(target, "p0.lifecycle");
    performWord(target, "akesi", "core120.akesi");

    expect(target.snapshot().session.learning.words.akesi).toMatchObject({
      discoveryState: "discovered",
      attunementState: "attuned",
      learningState: "produced",
    });
    expect(target.commitCore120LearningAction("core120.akesi.context_0", "duplicate"))
      .toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    const receiptId = core120LearningActionReceiptId(target.session.sessionId, "core120.akesi.repair");
    expect(target.snapshot().session.receiptIndex[receiptId]).toMatchObject({ domain: "learning" });

    const beforeReset = target.snapshot().session.learning.words.akesi;
    expect(target.resetArea("core120.reset")).toMatchObject({ accepted: true });
    expect(target.snapshot().session.learning.words.akesi).toEqual(beforeReset);
    const loaded = GameSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().learning.words.akesi).toEqual(beforeReset);
    expect(loaded.snapshot().receiptIndex[receiptId]).toBeDefined();
  });

  it("fails replay closed when an evidence ordinal or action receipt chain is forged", () => {
    const target = atArchive("core120.replay");
    completeP0(target, "p0.replay");
    expect(target.commitCore120LearningAction("core120.akesi.discover", "discover")).toMatchObject({ accepted: true });
    const save = structuredClone(target.toSave()) as any;
    const evidence = save.eventLedger.find((event: GameSessionEvent) => event.type === "learning_evidence_committed" &&
      event.payload.core120CurriculumActionId === "core120.akesi.discover");
    evidence.payload.core120EvidenceOrdinal = 1;
    expect(replayGameSession(save.sessionId, save.origin, save.eventLedger)).toMatchObject({ ok: false, reason: "invalid_event" });

    const p0Only = atArchive("core120.receipt-chain");
    completeP0(p0Only, "p0.receipt-chain");
    const p0Save = p0Only.toSave();
    const actionId = "core120.akesi.discover" as const;
    const appended: GameSessionEvent = {
      eventId: "forged.core120.replay-receipt",
      sequence: p0Save.eventLedger.length + 1,
      type: "core120_learning_action_committed",
      payload: {
        actionId,
        receiptId: core120LearningActionReceiptId(p0Save.sessionId, actionId),
        payloadHash: core120LearningActionPayloadHash(actionId),
      },
    };
    expect(replayGameSession(p0Save.sessionId, p0Save.origin, [...p0Save.eventLedger, appended]))
      .toMatchObject({ ok: false, reason: "invalid_event" });
  });

  it("exposes a narrow 120-word Flow projection and keeps external assets explicitly blocked", () => {
    const target = atArchive("core120.flow");
    completeP0(target, "p0.flow");
    const flow = PrologueFlowSession.fromSave(target.toSave());
    for (let tick = 0; tick < 760 && !flow.core120LearningView().station.inRange; tick += 1) {
      flow.advanceTicks(1, { moveX: 1 });
    }
    expect(flow.core120LearningView()).toMatchObject({
      mode: "settlement",
      p0PrerequisiteComplete: true,
      totalWordCount: 120,
      completedWordCount: 0,
      completedSemanticActionCount: 0,
      station: { targetId: "settlement.p0_inscription_archive", inRange: true },
      externalAssets: {
        pronunciationAudio: "blocked_pending_private_assets",
        glyphVisuals: "blocked_pending_private_approval",
        glyphCatalog: "draft",
        fullAssetAcceptance: false,
      },
    });
    expect(flow.performCore120LearningAction("flow.core120.discover", "core120.akesi.discover"))
      .toMatchObject({ accepted: true, result: { accepted: true } });
    expect(flow.core120LearningView().words.find((word) => word.wordId === "akesi"))
      .toMatchObject({ currentState: "discovered", nextActionId: "core120.akesi.attune",
        audioReady: false, glyphReady: false });
  });
});
