import { describe, expect, it } from "vitest";
import { GameSession, type SessionEconomySummary } from "../session/game-session";
import {
  PROLOGUE_SETTLEMENT_NPC_IDS,
  PROLOGUE_SETTLEMENT_REWARD_COIN,
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PROLOGUE_SETTLEMENT_TASK_ID,
  PrologueSettlementSession,
  createPrologueSettlementInitialSession,
  settlementReached,
} from "./prologue-settlement";

const economyWithExistingLots = (): SessionEconomySummary => ({
  coin: 7,
  walletRevision: 3,
  inventoryRevision: 5,
  lots: [
    {
      lotId: "lot.keep.hide",
      itemId: "material.hide.small_game",
      quantity: 2,
      ownershipRevision: 4,
      freshnessRevision: 1,
    },
    {
      lotId: "lot.keep.root",
      itemId: "food.root",
      quantity: 3,
      ownershipRevision: 5,
      freshnessRevision: 2,
    },
  ],
});

const createSettlement = (suffix: string, currentMp = 12, maxMp = 24): PrologueSettlementSession =>
  new PrologueSettlementSession(createPrologueSettlementInitialSession({
    sessionId: `save.settlement.${suffix}`,
    currentMp,
    maxMp,
    economy: economyWithExistingLots(),
  }));

describe("PrologueSettlementSession", () => {
  it("enters N02 from the canonical stream in one atomic session batch", () => {
    const source = GameSession.create({
      sessionId: "save.settlement.entry",
      mp: { currentMp: 18, maxMp: 24, worldVersion: 2 },
      currentSceneId: "scene.valley.stream_section",
      checkpoint: {
        id: "checkpoint.stream",
        sceneId: "scene.valley.stream_section",
        position: { x: 432, y: 82 },
        revision: 4,
      },
      economy: economyWithExistingLots(),
    });

    const result = PrologueSettlementSession.enterFromStream(source, "entry.n02.001");
    expect(result).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    const target = result.settlement!;
    const snapshot = target.snapshot();
    expect(snapshot.session.world.currentSceneId).toBe(PROLOGUE_SETTLEMENT_SCENE_ID);
    expect(snapshot.session.checkpoint).toMatchObject({
      id: "checkpoint.valley.settlement.entry",
      sceneId: PROLOGUE_SETTLEMENT_SCENE_ID,
      revision: 5,
    });
    expect(settlementReached(snapshot.session)).toBe(true);
    expect(snapshot.session.revision).toBe(4);
    expect(snapshot.killCount).toBe(0);

    const duplicate = PrologueSettlementSession.enterFromStream(target.session, "entry.n02.001");
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    expect(duplicate.settlement!.snapshot().session).toEqual(snapshot.session);
  });

  it("serves three structured NPC dialogues and clarification without mutating session truth", () => {
    const target = createSettlement("dialogue");
    expect(PROLOGUE_SETTLEMENT_NPC_IDS).toHaveLength(3);

    for (const npcId of PROLOGUE_SETTLEMENT_NPC_IDS) {
      const before = target.snapshot().session;
      const role = target.talk(npcId, "role");
      expect(role).toMatchObject({ accepted: true, reason: "read_only", node: { npcId, topic: "role" } });
      expect(role.node!.facts.length).toBeGreaterThan(1);
      const clarification = target.clarify(npcId, "directions");
      expect(clarification).toMatchObject({ accepted: true, reason: "read_only" });
      expect(target.snapshot().session).toEqual(before);
    }

    expect(target.talk("settlement.npc.missing")).toMatchObject({ accepted: false, reason: "unknown_npc" });
    expect(target.talk("settlement.npc.facility_manager", "trade")).toMatchObject({
      accepted: false,
      reason: "unsupported_topic",
    });
  });

  it("commits public relief through SurvivalSystem exactly once and keeps it free", () => {
    const target = createSettlement("relief");
    const before = target.snapshot();
    const first = target.usePublicRelief("relief.n02.001");
    expect(first).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(first.snapshot.session.survival.publicReliefFirstUseClaimed).toBe(true);
    expect(first.snapshot.session.economy).toEqual(before.session.economy);
    expect(first.snapshot.session.world.flags["global:public_well_used"]?.value).toBe(true);
    expect(first.snapshot.session.world.flags["global:communal_plant_meal_offered"]?.value).toBe(true);

    const after = target.snapshot().session;
    const duplicate = target.usePublicRelief("relief.n02.001");
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    expect(target.snapshot().session).toEqual(after);
  });

  it("recovers MP after an incorrect meditation answer while writing zero learning evidence", () => {
    const target = createSettlement("meditation", 5, 24);
    const before = target.snapshot().session;
    const wrong = target.meditate("meditation.n02.wrong", false);
    expect(wrong).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(wrong.snapshot.session.mp).toMatchObject({ currentMp: 8, maxMp: 24, worldVersion: 0 });
    expect(wrong.snapshot.session.learning).toEqual(before.learning);
    expect(wrong.snapshot.session.world.flags["global:meditation_court_activated"]?.value).toBe(true);
    expect(wrong.snapshot.session.receiptIndex["meditation:meditation.n02.wrong"]?.payloadHash)
      .toContain(":false");

    const after = target.snapshot().session;
    expect(target.meditate("meditation.n02.wrong", false)).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "duplicate",
    });
    expect(target.snapshot().session).toEqual(after);
    expect(target.meditate("meditation.n02.wrong", true)).toMatchObject({
      accepted: false,
      duplicate: false,
      reason: "transaction_conflict",
    });
  });

  it("accepts, surveys, and pays the manifest-defined nonviolent job once without replacing lots", () => {
    const target = createSettlement("job");
    const before = target.snapshot().session;
    expect(PROLOGUE_SETTLEMENT_REWARD_COIN).toBe(10);
    expect(target.submitSurveyJob("job.submit.early")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
    });
    expect(target.acceptSurveyJob("job.accept.001")).toMatchObject({ accepted: true });
    expect(target.inspectSurveyMarkers("job.survey.001")).toMatchObject({ accepted: true });
    const completion = target.submitSurveyJob("job.submit.001");

    expect(completion).toMatchObject({
      accepted: true,
      duplicate: false,
      snapshot: {
        orientationTask: {
          taskId: PROLOGUE_SETTLEMENT_TASK_ID,
          stage: "completed",
          rewardCoin: 10,
          nonviolent: true,
          magicRequired: false,
        },
        killCount: 0,
      },
    });
    expect(completion.snapshot.session.economy.coin).toBe(before.economy.coin + 10);
    expect(completion.snapshot.session.economy.lots).toEqual(before.economy.lots);
    expect(completion.snapshot.session.economy.inventoryRevision).toBe(before.economy.inventoryRevision);
    expect(completion.snapshot.session.economy.walletRevision).toBe(before.economy.walletRevision + 1);

    const after = target.snapshot().session;
    expect(target.submitSurveyJob("job.submit.replay")).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "already_completed",
    });
    expect(target.snapshot().session).toEqual(after);
  });

  it("round-trips GameSession save, recovers soft locks, and preserves global progress across area reset", () => {
    const target = createSettlement("save-reset", 6, 24);
    target.usePublicRelief("relief.persist");
    target.meditate("meditation.persist", false);
    target.acceptSurveyJob("job.persist.accept");
    target.inspectSurveyMarkers("job.persist.survey");
    target.submitSurveyJob("job.persist.submit");
    target.setCheckpoint("checkpoint.persist", "checkpoint.valley.settlement.square");

    const before = target.snapshot().session;
    const loaded = PrologueSettlementSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().session).toEqual(before);
    expect(loaded.snapshot()).toMatchObject({ killCount: 0, orientationTask: { stage: "completed" } });

    const recovered = loaded.recoverSoftLock("recover.persist.001");
    expect(recovered).toMatchObject({ accepted: true, reason: "committed" });
    const reset = loaded.resetArea("reset.settlement.001");
    expect(reset.accepted).toBe(true);
    expect(reset.snapshot.session.quests[PROLOGUE_SETTLEMENT_TASK_ID]?.stageId).toBe("completed");
    expect(reset.snapshot.session.economy.coin).toBe(before.economy.coin);
    expect(reset.snapshot.session.receiptIndex).toEqual(before.receiptIndex);
    expect(reset.snapshot.killCount).toBe(0);
  });
});
