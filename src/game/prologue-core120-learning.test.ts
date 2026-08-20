import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest } from "../content/runtime-core120-curriculum-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import {
  materializeCore120LearningEvidence,
  materializeCore120LearningEvidenceVariants,
  type Core120LearningActionId,
} from "../learning/core120-campaign";
import { commitSessionProposal, type SessionProposalBatch } from "../session/adapters";
import { GameSession, replayGameSession, type GameSessionEvent } from "../session/game-session";
import { type P0LearningActionId } from "./p0-learning-contract";
import {
  core120LearningActionPayloadHash,
  core120LearningActionPayloadHashes,
  core120LearningActionReceiptId,
  PrologueCore120LearningCoordinator,
  PROLOGUE_CORE120_LEARNING_ACTION_IDS,
  type Core120LearningAuthority,
} from "./prologue-core120-learning";
import { PrologueFlowSession } from "./prologue-flow";
import { PrologueSettlementSession, createPrologueSettlementInitialSession } from "./prologue-settlement";

const manifest = readRuntimeCore120CurriculumManifest(generated);
const p0Manifest = readRuntimeP0CurriculumManifest(generated);

function atArchive(sessionId: string, visitedSceneIds: readonly string[] = []): PrologueSettlementSession {
  let session = createPrologueSettlementInitialSession({ sessionId });
  for (const [index, sceneId] of visitedSceneIds.entries()) {
    const visit = commitSessionProposal(session, { transactionId: `core120.visit.${index}`, drafts: [
      { eventId: `core120.visit.${index}.${sceneId}`, type: "scene_entered", payload: { sceneId } },
      { eventId: `core120.visit.${index}.return`, type: "scene_entered",
        payload: { sceneId: manifest.recoveryStation.sceneId } },
    ] });
    if (!visit.committed) throw new Error(`failed to author prior visit ${sceneId}`);
    session = visit.session;
  }
  const target = new PrologueSettlementSession(session);
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
    const visitedScenes = manifest.words.akesi!.contexts.map((context) => context.location.sceneId);
    const target = atArchive("core120.lifecycle", visitedScenes);
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

  it("allows either world context first and permits archive recovery only after a prior scene visit", () => {
    const target = atArchive("core120.context-order");
    completeP0(target, "p0.context-order");
    expect(target.commitCore120LearningAction("core120.akesi.discover", "context.discover").accepted).toBe(true);
    expect(target.commitCore120LearningAction("core120.akesi.attune", "context.attune").accepted).toBe(true);
    expect(target.commitCore120LearningAction("core120.akesi.context_1", "context.second-first"))
      .toMatchObject({ accepted: true, reason: "committed" });
    expect(target.commitCore120LearningAction("core120.akesi.context_0", "context.unvisited"))
      .toMatchObject({ accepted: false, reason: "recovery_scene_not_visited" });

    const missingScene = manifest.words.akesi!.contexts[0].location.sceneId;
    const visit = commitSessionProposal(target.session, { transactionId: "context.visit", drafts: [
      { eventId: "context.visit.out", type: "scene_entered", payload: { sceneId: missingScene } },
      { eventId: "context.visit.return", type: "scene_entered",
        payload: { sceneId: manifest.recoveryStation.sceneId } },
    ] });
    expect(visit.committed).toBe(true);
    if (!visit.committed) throw new Error("context visit failed");
    const authority = { runtimeSceneId: manifest.recoveryStation.sceneId,
      playerPositionPx: { x: 38 * 16, y: 28 * 16 } } as const;
    const recovered = new PrologueCore120LearningCoordinator({ session: visit.session, ...authority })
      .commit("core120.akesi.context_0", "context.recovered");
    expect(recovered).toMatchObject({ accepted: true, reason: "committed" });
    const repaired = new PrologueCore120LearningCoordinator({ session: recovered.session, ...authority })
      .commit("core120.akesi.repair", "context.repair");
    expect(repaired).toMatchObject({ accepted: true, reason: "committed" });
  });

  it("fails replay closed when an evidence ordinal or action receipt chain is forged", () => {
    const target = atArchive("core120.replay");
    completeP0(target, "p0.replay");
    expect(target.commitCore120LearningAction("core120.akesi.discover", "discover")).toMatchObject({ accepted: true });
    const save = structuredClone(target.toSave()) as any;
    const committed = save.eventLedger.find((event: GameSessionEvent) =>
      event.type === "core120_learning_action_committed" && event.payload.actionId === "core120.akesi.discover");
    committed.payload.payloadHash = `sha256:${"0".repeat(64)}`;
    expect(replayGameSession(save.sessionId, save.origin, save.eventLedger)).toMatchObject({ ok: false, reason: "invalid_event" });

    const stale = structuredClone(target.toSave()) as any;
    const staleEvent = stale.eventLedger.find((event: GameSessionEvent) =>
      event.type === "core120_learning_action_committed" && event.payload.actionId === "core120.akesi.discover");
    staleEvent.payload.authority.expectedWorldRevision += 1;
    staleEvent.payload.payloadHash = core120LearningActionPayloadHash(staleEvent.payload.actionId,
      staleEvent.payload.authority);
    expect(replayGameSession(stale.sessionId, stale.origin, stale.eventLedger))
      .toMatchObject({ ok: false, reason: "invalid_event" });

    const p0Only = atArchive("core120.receipt-chain");
    completeP0(p0Only, "p0.receipt-chain");
    const p0Save = p0Only.toSave();
    const authoritylessCurrentReceipt: GameSessionEvent = {
      eventId: "forged.core120.current-receipt-only",
      sequence: p0Save.eventLedger.length + 1,
      type: "core120_learning_action_committed",
      payload: {
        actionId: "core120.akesi.discover",
        receiptId: core120LearningActionReceiptId(p0Save.sessionId, "core120.akesi.discover"),
        payloadHash: core120LearningActionPayloadHash("core120.akesi.discover"),
      },
    };
    expect(replayGameSession(p0Save.sessionId, p0Save.origin,
      [...p0Save.eventLedger, authoritylessCurrentReceipt]))
      .toMatchObject({ ok: false, reason: "invalid_event" });

    const actionId = "core120.akesi.context_0" as const;
    const appended: GameSessionEvent = {
      eventId: "forged.core120.replay-prerequisite",
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

  it("keeps the v0.1 evidence-then-receipt ledger shape loadable", () => {
    const target = atArchive("core120.legacy-ledger");
    completeP0(target, "p0.legacy-ledger");
    const base = target.toSave();
    const actionId = "core120.akesi.discover" as const;
    const evidence = materializeCore120LearningEvidenceVariants(manifest, base.sessionId, actionId)[1]!;
    const appended: GameSessionEvent[] = evidence.map((entry, ordinal) => ({
      eventId: `session.core120.learning.${actionId}.${ordinal}`,
      sequence: base.eventLedger.length + ordinal + 1,
      type: "learning_evidence_committed",
      payload: { evidence: entry, core120CurriculumActionId: actionId, core120EvidenceOrdinal: ordinal },
    }));
    const currentReceiptWithoutAuthority: GameSessionEvent = {
      eventId: `session.core120.learning.receipt.${actionId}`,
      sequence: base.eventLedger.length + evidence.length + 1,
      type: "core120_learning_action_committed",
      payload: { actionId, receiptId: core120LearningActionReceiptId(base.sessionId, actionId),
        payloadHash: core120LearningActionPayloadHash(actionId) },
    };
    expect(replayGameSession(base.sessionId, base.origin, [...base.eventLedger, ...appended,
      currentReceiptWithoutAuthority])).toMatchObject({ ok: false, reason: "invalid_event" });
    appended.push({
      eventId: `session.core120.learning.receipt.${actionId}`,
      sequence: base.eventLedger.length + evidence.length + 1,
      type: "core120_learning_action_committed",
      payload: { actionId, receiptId: core120LearningActionReceiptId(base.sessionId, actionId),
        payloadHash: core120LearningActionPayloadHashes(actionId)[1]! },
    });
    const replayed = replayGameSession(base.sessionId, base.origin, [...base.eventLedger, ...appended]);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error(`legacy core120 replay failed at ${replayed.failedEventId}`);
    expect(replayed.session.snapshot().learning.words.akesi?.discoveryState).toBe("discovered");
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

  it("replays all 600 canonical actions through the unified GameSession and reloads the completed 120-word save", () => {
    const visitedScenes = [...new Set(manifest.scope.wordIds.flatMap((wordId) =>
      manifest.words[wordId]!.contexts.map((context) => context.location.sceneId)))];
    const target = atArchive("core120.full-session", visitedScenes);
    completeP0(target, "p0.full-session");
    const base = target.toSave();
    const ledger: GameSessionEvent[] = [...base.eventLedger];
    let sequence = ledger.at(-1)?.sequence ?? 0;
    const expectedWorldRevision = target.session.snapshot().world.revision;

    for (const actionId of PROLOGUE_CORE120_LEARNING_ACTION_IDS) {
      const [, wordId, kind] = /^core120\.([a-z]+)\.(discover|attune|context_0|context_1|repair)$/
        .exec(actionId)!;
      const contextIndex = kind === "context_0" ? 0 : kind === "context_1" ? 1 : null;
      const authority: Core120LearningAuthority = contextIndex === null
        ? {
            mode: "archive_instruction",
            sceneId: manifest.recoveryStation.sceneId,
            targetId: manifest.recoveryStation.targetId,
            playerPositionPx: manifest.recoveryStation.interactionPointPx,
            expectedWorldRevision,
            contextIndex: null,
            recoveredSceneId: null,
          }
        : {
            mode: "recovery_archive",
            sceneId: manifest.recoveryStation.sceneId,
            targetId: manifest.recoveryStation.targetId,
            playerPositionPx: manifest.recoveryStation.interactionPointPx,
            expectedWorldRevision,
            contextIndex,
            recoveredSceneId: manifest.words[wordId!]!.contexts[contextIndex].location.sceneId,
          };
      ledger.push({
        eventId: `session.core120.learning.receipt.${actionId}`,
        sequence: ++sequence,
        type: "core120_learning_action_committed",
        payload: {
          actionId,
          receiptId: core120LearningActionReceiptId(base.sessionId, actionId),
          payloadHash: core120LearningActionPayloadHash(actionId, authority),
          authority,
        },
      });
    }

    const replayed = replayGameSession(base.sessionId, base.origin, ledger);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error(`full core120 replay failed at ${replayed.failedEventId}: ${replayed.reason}`);
    const completed = replayed.session.snapshot();
    expect(PROLOGUE_CORE120_LEARNING_ACTION_IDS).toHaveLength(600);
    expect(manifest.scope.wordIds).toHaveLength(120);
    expect(manifest.scope.wordIds.every((wordId) => completed.learning.words[wordId]?.learningState === "produced")).toBe(true);
    expect(PROLOGUE_CORE120_LEARNING_ACTION_IDS.every((actionId) =>
      completed.receiptIndex[core120LearningActionReceiptId(base.sessionId, actionId)]?.domain === "learning")).toBe(true);

    const save = replayed.session.toSave();
    const loaded = GameSession.fromSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.snapshot()).toEqual(completed);
    expect(loaded.events()).toHaveLength(ledger.length);
  }, 60_000);
});
