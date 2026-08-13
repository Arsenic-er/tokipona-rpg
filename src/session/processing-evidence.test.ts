import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "../game/economy-state";
import type { WildlifeProcessingWorkOrder } from "../game/wildlife-processing";
import { commitSessionProposal, proposeWildlifeProcessingEvidence } from "./adapters";
import { GameSession } from "./game-session";

const workOrder: WildlifeProcessingWorkOrder = {
  workOrderId: "wal-output:sha256:1111111111111111111111111111111111111111111111111111111111111111",
  recipeId: "tan.small_hide.v0.1", recipeVersion: "chapter-01.prologue.1", stationId: "settlement_tannery",
  initiatingPlayerSaveId: "save.evidence", status: "reserved", inputs: [], inputLotIds: [], startEventSequence: 0,
  requiredEventCount: 1, eligibleEventFilter: ["mainline_world_predicate_commit", "non_replayed_side_task_commit", "region_transition_commit"],
  processedThroughSequence: 0, processedEventIds: [], stationStorageProfile: "settlement_tannery",
  startWorldTick: 0, readyWorldTick: 0, outputLotIds: [], failureReason: null, revision: 0,
};

const create = () => GameSession.create({ sessionId: "save.evidence", mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
  currentSceneId: "scene.valley.den_bypass", economy: { ...createEmptySessionEconomy(), workOrders: [workOrder] } });

describe("trusted processing evidence", () => {
  it("binds quest, world predicate, and true scene-transition evidence to exact prior ledger subjects", () => {
    let session = create();
    const subjects = [
      { eventId: "subject.quest", type: "quest_stage_set" as const,
        payload: { questId: "quest.side", stageId: "completed", stageOrdinal: 1 },
        classification: "non_replayed_side_task_commit" as const },
      { eventId: "subject.world", type: "world_flag_set" as const,
        payload: { flagId: "world.bridge.restored", value: true, scope: "global" as const },
        classification: "mainline_world_predicate_commit" as const },
      { eventId: "subject.scene", type: "scene_entered" as const,
        payload: { sceneId: "scene.valley.settlement" }, classification: "region_transition_commit" as const },
    ];
    for (const [index, subject] of subjects.entries()) {
      let committed = commitSessionProposal(session, { transactionId: subject.eventId,
        drafts: [{ eventId: subject.eventId, type: subject.type, payload: subject.payload } as any] });
      expect(committed.committed).toBe(true); session = committed.session;
      committed = commitSessionProposal(session, proposeWildlifeProcessingEvidence(session, {
        evidenceId: `evidence.${index}`, workOrderId: workOrder.workOrderId,
        subjectEventId: subject.eventId, classification: subject.classification,
      }));
      expect(committed.committed).toBe(true); session = committed.session;
    }
    expect(Object.keys(session.snapshot().receiptIndex).filter((id) => id.startsWith("wildlife-processing-evidence:"))).toHaveLength(3);
    const loaded = GameSession.load(JSON.parse(JSON.stringify(session.toSave())));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.session.snapshot()).toEqual(session.snapshot());
  });

  it("rejects a duplicate subject, a zero-stage quest, and a same-scene pseudo-transition", () => {
    let session = create();
    let committed = commitSessionProposal(session, { transactionId: "subject.quest", drafts: [{ eventId: "subject.quest",
      type: "quest_stage_set", payload: { questId: "quest.side", stageId: "started", stageOrdinal: 1 } }] });
    expect(committed.committed).toBe(true); session = committed.session;
    committed = commitSessionProposal(session, proposeWildlifeProcessingEvidence(session, { evidenceId: "first", workOrderId: workOrder.workOrderId,
      subjectEventId: "subject.quest", classification: "non_replayed_side_task_commit" }));
    expect(committed.committed).toBe(true); session = committed.session;
    expect(commitSessionProposal(session, proposeWildlifeProcessingEvidence(session, { evidenceId: "second", workOrderId: workOrder.workOrderId,
      subjectEventId: "subject.quest", classification: "non_replayed_side_task_commit" }))).toMatchObject({ committed: false, reason: "receipt_payload_conflict" });

    committed = commitSessionProposal(session, { transactionId: "subject.zero-stage", drafts: [{ eventId: "subject.zero-stage",
      type: "quest_stage_set", payload: { questId: "quest.zero", stageId: "not-started", stageOrdinal: 0 } }] });
    expect(committed.committed).toBe(true); session = committed.session;
    expect(commitSessionProposal(session, proposeWildlifeProcessingEvidence(session, { evidenceId: "zero-stage", workOrderId: workOrder.workOrderId,
      subjectEventId: "subject.zero-stage", classification: "non_replayed_side_task_commit" }))).toMatchObject({ committed: false, reason: "invalid_event" });

    committed = commitSessionProposal(session, { transactionId: "subject.same-scene", drafts: [{ eventId: "subject.same-scene",
      type: "scene_entered", payload: { sceneId: "scene.valley.den_bypass" } }] });
    expect(committed.committed).toBe(true); session = committed.session;
    expect(commitSessionProposal(session, proposeWildlifeProcessingEvidence(session, { evidenceId: "same-scene", workOrderId: workOrder.workOrderId,
      subjectEventId: "subject.same-scene", classification: "region_transition_commit" }))).toMatchObject({ committed: false, reason: "invalid_event" });
  });
});
