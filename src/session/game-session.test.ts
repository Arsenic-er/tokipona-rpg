import { describe, expect, it } from "vitest";
import { SurvivalSystem } from "../game/survival";
import {
  GAME_SESSION_SAVE_SCHEMA,
  LEGACY_GAME_SESSION_SAVE_SCHEMA,
  GameSession,
  adaptMpLedgerSnapshot,
  adaptSurvivalSave,
  adaptTradeSnapshot,
  migrateGameSessionSave,
  replayGameSession,
  type GameSessionEvent,
  type GameSessionSave,
  type LegacyGameSessionSaveV1,
  type SessionEconomySummary,
} from "./game-session";

const FORGED_SAFE_RANGE_SHA = `sha256:${"0".repeat(64)}` as const;

const initialEconomy = (coin = 0): SessionEconomySummary => ({
  coin,
  walletRevision: coin === 0 ? 0 : 1,
  inventoryRevision: 0,
  lots: [],
});

const testCanonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(testCanonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, testCanonicalize(item)]));
  }
  return value;
};

const testDigest = (value: unknown): string => {
  const text = JSON.stringify(testCanonicalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createSession = (): GameSession => GameSession.create({
  sessionId: "save.test.001",
  mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: "scene.n00.arrival",
});

describe("GameSession", () => {
  it("round-trips a checksummed save and replays the same monotonic ledger", () => {
    const session = createSession();
    const events: GameSessionEvent[] = [
      {
        eventId: "event.scene.n01",
        sequence: 1,
        type: "scene_entered",
        payload: { sceneId: "scene.n01.stream" },
      },
      {
        eventId: "event.flag.stream-open",
        sequence: 2,
        type: "world_flag_set",
        payload: { flagId: "stream_path_open", value: true, scope: "area", areaId: "n01" },
      },
      {
        eventId: "event.quest.prologue.1",
        sequence: 3,
        type: "quest_stage_set",
        payload: { questId: "quest.prologue", stageId: "reach_stream", stageOrdinal: 1 },
      },
      {
        eventId: "event.receipt.first-water",
        sequence: 4,
        type: "receipt_recorded",
        payload: { receiptId: "receipt.water.001", domain: "world", payloadHash: "world-water-v1" },
      },
    ];

    events.forEach((event) => expect(session.apply(event).applied).toBe(true));
    const save = session.toSave();
    expect(save.schema).toBe(GAME_SESSION_SAVE_SCHEMA);

    const loaded = GameSession.load(JSON.parse(JSON.stringify(save)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.session.events()).toEqual(events);

    const replayed = replayGameSession(save.sessionId, save.origin, save.eventLedger);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.session.snapshot()).toEqual(save.state);
  });

  it("deduplicates the same event before sequence checks and rejects a same-ID payload conflict", () => {
    const session = createSession();
    const event: GameSessionEvent = {
      eventId: "event.scene.n01",
      sequence: 1,
      type: "scene_entered",
      payload: { sceneId: "scene.n01.stream" },
    };
    expect(session.apply(event).reason).toBe("applied");
    expect(session.apply(event)).toMatchObject({ applied: false, duplicate: true, reason: "duplicate_event" });

    const conflict: GameSessionEvent = {
      ...event,
      payload: { sceneId: "scene.n02.settlement" },
    };
    expect(session.apply(conflict)).toMatchObject({
      applied: false,
      duplicate: false,
      reason: "event_payload_conflict",
    });
    expect(session.nextSequence()).toBe(2);

    expect(session.apply({
      eventId: "event.sequence.gap",
      sequence: 3,
      type: "scene_entered",
      payload: { sceneId: "scene.n03.waterwheel" },
    })).toMatchObject({ applied: false, reason: "event_sequence_gap" });
  });

  it("fails closed for malformed, corrupted, and replay-divergent saves", () => {
    const session = createSession();
    session.apply({
      eventId: "event.scene.n01",
      sequence: 1,
      type: "scene_entered",
      payload: { sceneId: "scene.n01.stream" },
    });
    const save = session.toSave();

    const damagedIntegrity = structuredClone(save);
    (damagedIntegrity.integrity as { digest: string }).digest = "00000000";
    expect(GameSession.load(damagedIntegrity)).toEqual({ ok: false, error: "integrity_mismatch" });

    const malformed = structuredClone(save) as unknown as {
      state: { survival: { hydration: number } };
    };
    malformed.state.survival.hydration = Number.NaN;
    expect(GameSession.load(malformed)).toEqual({ ok: false, error: "invalid_save" });

    const replayDivergent = structuredClone(save) as {
      -readonly [Key in keyof GameSessionSave]: GameSessionSave[Key];
    };
    replayDivergent.state = {
      ...replayDivergent.state,
      world: { ...replayDivergent.state.world, currentSceneId: "scene.tampered" },
    };
    const resigned = GameSession.create({
      sessionId: replayDivergent.sessionId,
      mp: replayDivergent.origin.mp,
      currentSceneId: replayDivergent.origin.world.currentSceneId,
      learning: replayDivergent.origin.learning,
      survival: replayDivergent.origin.survival,
      economy: replayDivergent.origin.economy,
    }).toSave();
    replayDivergent.integrity = {
      ...replayDivergent.integrity,
      // A valid digest is copied from a structurally valid but semantically different save.
      digest: resigned.integrity.digest,
    };
    expect(GameSession.load(replayDivergent).ok).toBe(false);

    expect(GameSession.load({ schema: "tokipona.game-session.v99" })).toEqual({
      ok: false,
      error: "unsupported_schema",
    });
  });

  it("migrates a valid v0.1 snapshot without silently defaulting its persistent state", () => {
    const source = createSession();
    source.apply({
      eventId: "event.flag.global",
      sequence: 1,
      type: "world_flag_set",
      payload: { flagId: "prologue_started", value: true, scope: "global" },
    });
    const state = source.snapshot();
    const legacy: LegacyGameSessionSaveV1 = {
      schema: LEGACY_GAME_SESSION_SAVE_SCHEMA,
      sessionId: source.sessionId,
      mp: state.mp,
      world: state.world,
      learning: state.learning,
      survival: state.survival,
      economy: state.economy,
      quests: state.quests,
    };

    const migration = migrateGameSessionSave(legacy);
    expect(migration.ok).toBe(true);
    if (!migration.ok) return;
    expect(migration.migratedFrom).toBe(LEGACY_GAME_SESSION_SAVE_SCHEMA);
    expect(migration.save.schema).toBe(GAME_SESSION_SAVE_SCHEMA);

    const loaded = GameSession.load(legacy);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(LEGACY_GAME_SESSION_SAVE_SCHEMA);
    expect(loaded.session.snapshot().world.flags["global:prologue_started"]?.value).toBe(true);
  });

  it("resets only an area's ephemeral world state without rolling learning or receipts back", () => {
    const session = createSession();
    const events: GameSessionEvent[] = [
      {
        eventId: "event.learning.telo",
        sequence: 1,
        type: "learning_evidence_committed",
        payload: { evidence: {
          eventId: "learning.event.discover.telo", eventType: "glyph_discovered",
          playerSaveId: "save.test.001", wordId: "telo", idempotencyKey: "learning.discover.telo",
          locationId: "n01.stream.glyph.telo", recognitionMode: "world_observation",
        } },
      },
      {
        eventId: "event.economy.first-wage",
        sequence: 2,
        type: "economy_wallet_changed",
        payload: {
          expectedWalletRevision: 0,
          nextWalletRevision: 1,
          coinDelta: 7,
          nextCoin: 7,
        },
      },
      {
        eventId: "event.receipt.first-wage",
        sequence: 3,
        type: "receipt_recorded",
        payload: { receiptId: "trade.wage.001", domain: "trade", payloadHash: "coin+7" },
      },
      {
        eventId: "event.flag.area",
        sequence: 4,
        type: "world_flag_set",
        payload: { flagId: "crate_broken", value: true, scope: "area", areaId: "n01" },
      },
      {
        eventId: "event.flag.global",
        sequence: 5,
        type: "world_flag_set",
        payload: { flagId: "telo_known", value: true, scope: "global" },
      },
      {
        eventId: "event.reset.n01",
        sequence: 6,
        type: "area_reset",
        payload: { areaId: "n01", respawnSceneId: "scene.n01.checkpoint" },
      },
    ];
    events.forEach((event) => expect(session.apply(event).applied).toBe(true));

    const snapshot = session.snapshot();
    expect(snapshot.world.flags["area:n01:crate_broken"]).toBeUndefined();
    expect(snapshot.world.flags["global:telo_known"]?.value).toBe(true);
    expect(snapshot.world.areaEpochs.n01).toBe(1);
    expect(snapshot.world.currentSceneId).toBe("scene.n01.checkpoint");
    expect(snapshot.learning.words.telo?.discoveryState).toBe("discovered");
    expect(snapshot.economy.coin).toBe(7);
    expect(snapshot.receiptIndex["trade.wage.001"]?.payloadHash).toBe("coin+7");

    const duplicateReceipt = session.apply({
      eventId: "event.receipt.first-wage.replay",
      sequence: 7,
      type: "receipt_recorded",
      payload: { receiptId: "trade.wage.001", domain: "trade", payloadHash: "coin+7" },
    });
    expect(duplicateReceipt).toMatchObject({ applied: false, duplicate: true, reason: "duplicate_receipt" });
    expect(session.nextSequence()).toBe(7);

    const receiptConflict = session.apply({
      eventId: "event.receipt.first-wage.conflict",
      sequence: 7,
      type: "receipt_recorded",
      payload: { receiptId: "trade.wage.001", domain: "trade", payloadHash: "coin+70" },
    });
    expect(receiptConflict).toMatchObject({ applied: false, duplicate: false, reason: "receipt_payload_conflict" });
  });

  it("isolates identical flag IDs by region, preserves them across area reset, and round-trips", () => {
    const session = createSession();
    const events: GameSessionEvent[] = [
      {
        eventId: "event.flag.region.valley",
        sequence: 1,
        type: "world_flag_set",
        payload: { flagId: "shared:landmark_reached", value: true, scope: "region", regionId: "valley_prologue" },
      },
      {
        eventId: "event.flag.region.coast",
        sequence: 2,
        type: "world_flag_set",
        payload: { flagId: "shared:landmark_reached", value: "coast", scope: "region", regionId: "coast_prologue" },
      },
      {
        eventId: "event.flag.area.valley",
        sequence: 3,
        type: "world_flag_set",
        payload: { flagId: "runtime_local", value: true, scope: "area", areaId: "valley_prologue" },
      },
      {
        eventId: "event.reset.valley",
        sequence: 4,
        type: "area_reset",
        payload: { areaId: "valley_prologue" },
      },
    ];
    events.forEach((event) => expect(session.apply(event).applied).toBe(true));

    const snapshot = session.snapshot();
    expect(snapshot.world.flags["area:valley_prologue:runtime_local"]).toBeUndefined();
    expect(snapshot.world.flags["region:valley_prologue:shared:landmark_reached"]).toMatchObject({
      scope: "region",
      regionId: "valley_prologue",
      value: true,
    });
    expect(snapshot.world.flags["region:coast_prologue:shared:landmark_reached"]).toMatchObject({
      scope: "region",
      regionId: "coast_prologue",
      value: "coast",
    });

    const save = session.toSave();
    const loaded = GameSession.load(JSON.parse(JSON.stringify(save)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.snapshot()).toEqual(snapshot);
    const replayed = replayGameSession(save.sessionId, save.origin, save.eventLedger);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.session.snapshot()).toEqual(snapshot);
  });

  it("rejects region flags without ownership and keeps legacy v0.2 global/area flag shapes loadable", () => {
    const invalid = createSession();
    const missingOwner = {
      eventId: "event.flag.region.missing-owner",
      sequence: 1,
      type: "world_flag_set",
      payload: { flagId: "missing_owner", value: true, scope: "region" },
    } as unknown as GameSessionEvent;
    expect(invalid.apply(missingOwner)).toMatchObject({ applied: false, reason: "invalid_event" });

    const compatible = createSession();
    expect(compatible.apply({
      eventId: "event.flag.global.compat",
      sequence: 1,
      type: "world_flag_set",
      payload: { flagId: "legacy_global", value: true, scope: "global" },
    }).applied).toBe(true);
    expect(compatible.apply({
      eventId: "event.flag.area.compat",
      sequence: 2,
      type: "world_flag_set",
      payload: { flagId: "legacy_area", value: true, scope: "area", areaId: "n01" },
    }).applied).toBe(true);
    const save = compatible.toSave();
    expect("regionId" in save.state.world.flags["global:legacy_global"]!).toBe(false);
    expect("regionId" in save.state.world.flags["area:n01:legacy_area"]!).toBe(false);
    const loaded = GameSession.load(JSON.parse(JSON.stringify(save)));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.session.snapshot()).toEqual(compatible.snapshot());
  });
  it("adapts existing subsystem snapshots without sharing mutable child state", () => {
    expect(adaptMpLedgerSnapshot({ mp: 9, currentMp: 9, maxMp: 24, worldVersion: 3 })).toEqual({
      currentMp: 9,
      maxMp: 24,
      worldVersion: 3,
    });

    const survival = new SurvivalSystem();
    const survivalSave = survival.toSave();
    expect(adaptSurvivalSave(survivalSave)).toEqual(survivalSave);

    const tradeLike = {
      coin: 2,
      walletRevision: 1,
      inventoryRevision: 1,
      quoteSequence: 0,
      lots: [{
        lotId: "lot.meat.001",
        itemId: "food.raw_small_game_meat",
        sourceLotIds: [],
        legalOwnerId: "player",
        stolenFromId: null,
        processingTransactionId: null,
        quantity: 1,
        originKind: "natural" as const,
        naturalFraction: 1,
        freshness: "fresh" as const,
        qualityMultiplier: 1,
        contaminationMu: 0,
        economyEligible: true,
        reserved: false,
        equipped: false,
        ownershipRevision: 0,
        freshnessRevision: 0,
        wildlifeProvenance: {
          lifeInstanceId: "life.fixture.meat", deathEventId: "death.fixture.meat", harvestEventId: "harvest.fixture.meat",
          parentLotIds: [], transformEventId: null, matterOrigin: "natural" as const, freshnessCreatedTick: 0,
          preservationProfileId: "raw_meat_temperate", lastDecayEvalTick: 0, remainingFreshnessSeconds: 3600,
          reservationRevision: 0, reservedByWorkOrderId: null,
        },
      }],
      merchantStates: [],
    };
    const adapted = adaptTradeSnapshot(tradeLike);
    tradeLike.lots[0]!.quantity = 0;
    expect(adapted.lots[0]?.quantity).toBe(1);
  });

  it("persists checkpoints atomically, rejects non-incrementing revisions, and gives legacy saves an explicit origin fallback", () => {
    const session = createSession();
    expect(session.snapshot().checkpoint).toEqual({
      id: "checkpoint.session-entry",
      sceneId: "scene.n00.arrival",
      position: { x: 0, y: 0 },
      revision: 0,
    });
    expect(session.apply({
      eventId: "event.checkpoint.n01",
      sequence: 1,
      type: "checkpoint_set",
      payload: {
        checkpoint: {
          id: "checkpoint.n01.stream",
          sceneId: "scene.n01.stream",
          position: { x: 40, y: 60 },
          revision: 1,
        },
      },
    }).applied).toBe(true);
    expect(session.apply({
      eventId: "event.checkpoint.same-revision",
      sequence: 2,
      type: "checkpoint_set",
      payload: {
        checkpoint: {
          id: "checkpoint.n01.other",
          sceneId: "scene.n01.stream",
          position: { x: 80, y: 60 },
          revision: 1,
        },
      },
    })).toMatchObject({ applied: false, reason: "state_regression" });
    expect(session.nextSequence()).toBe(2);

    const state = session.snapshot();
    const legacy: LegacyGameSessionSaveV1 = {
      schema: LEGACY_GAME_SESSION_SAVE_SCHEMA,
      sessionId: session.sessionId,
      mp: state.mp,
      world: state.world,
      learning: state.learning,
      survival: state.survival,
      economy: state.economy,
      quests: state.quests,
    };
    const loaded = GameSession.load(legacy);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.session.snapshot().checkpoint).toEqual({
        id: "checkpoint.legacy-entry",
        sceneId: state.world.currentSceneId,
        position: { x: 0, y: 0 },
        revision: 0,
      });
    }
  });

  it("indexes irreversible receipts already present in an imported child save", () => {
    const survival = new SurvivalSystem();
    expect(survival.consume("food.travel_ration", "survival.consume.ration.001").committed).toBe(true);
    const session = GameSession.create({
      sessionId: "save.with-child-receipt",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.n00.arrival",
      survival: survival.toSave(),
    });

    expect(session.snapshot().receiptIndex["survival.consume.ration.001"]).toMatchObject({
      domain: "survival",
      recordedAtSequence: 0,
    });
    expect(session.apply({
      eventId: "event.try-reuse-child-receipt",
      sequence: 1,
      type: "receipt_recorded",
      payload: {
        receiptId: "survival.consume.ration.001",
        domain: "survival",
        payloadHash: "different-payload",
      },
    })).toMatchObject({ applied: false, reason: "receipt_payload_conflict" });
    expect(session.nextSequence()).toBe(1);
  });

  it("commits capacity and max MP as one monotonic milestone and preserves it across reset/save/replay", () => {
    const session = createSession();
    const milestone: GameSessionEvent = {
      eventId: "event.capability.pre-cistern",
      sequence: 1,
      type: "capability_milestone_committed",
      payload: {
        milestoneId: "pre_cistern_length_phrase",
        writerEvent: "first_evidence_package_committed",
        sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
        sourceDigest: `sha256:${"a".repeat(64)}`,
        contractRevision: "0.1.0",
        resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
      },
    };
    expect(session.apply(milestone)).toMatchObject({ applied: true, reason: "applied" });
    expect(session.capabilitySnapshot()).toMatchObject({
      expressionCapacityWords: 2,
      focusSlots: 2,
      revision: 1,
    });
    expect(session.snapshot().mp).toEqual({ currentMp: 24, maxMp: 26, worldVersion: 1 });

    expect(session.apply({
      eventId: "event.reset.after-capability",
      sequence: 2,
      type: "area_reset",
      payload: { areaId: "n05" },
    }).applied).toBe(true);
    expect(session.snapshot().capabilities).toEqual(session.capabilitySnapshot());
    expect(session.snapshot().capabilities.expressionCapacityWords).toBe(2);

    const save = session.toSave();
    const loaded = GameSession.load(JSON.parse(JSON.stringify(save)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    const replayed = replayGameSession(save.sessionId, save.origin, save.eventLedger);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.session.snapshot()).toEqual(session.snapshot());

    expect(session.apply({
      eventId: "event.max-mp-alone-forbidden",
      sequence: 3,
      type: "mp_replaced",
      payload: { mp: { currentMp: 24, maxMp: 30, worldVersion: 2 } },
    })).toMatchObject({ applied: false, reason: "invalid_event" });
  });

  it("rejects live whole-economy replacement while replaying an unmixed historical ledger", () => {
    const live = createSession();
    const legacyEconomy = initialEconomy(7);
    const event: GameSessionEvent = {
      eventId: "event.legacy.economy-replaced",
      sequence: 1,
      type: "economy_replaced",
      payload: { economy: legacyEconomy },
    };
    expect(live.apply(event)).toMatchObject({ applied: false, reason: "invalid_event" });
    expect(live.nextSequence()).toBe(1);

    const replayed = replayGameSession(live.sessionId, live.toSave().origin, [event]);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.session.snapshot().economy).toMatchObject(legacyEconomy);
    expect(replayed.session.apply({
      ...event,
      eventId: "event.legacy.economy-replaced.live-after-load",
      sequence: 2,
    })).toMatchObject({ applied: false, reason: "invalid_event" });
    expect(replayGameSession(live.sessionId, live.toSave().origin, [
      event,
      {
        eventId: "event.modern.wallet",
        sequence: 2,
        type: "economy_wallet_changed",
        payload: { expectedWalletRevision: 1, nextWalletRevision: 2, coinDelta: 1, nextCoin: 8 },
      },
    ])).toMatchObject({ ok: false, reason: "invalid_event" });
  });

  it("deduplicates milestones by milestone ID, rejects conflicting payloads, and keeps capacity monotonic", () => {
    const session = createSession();
    const basePayload = {
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      sourceDigest: `sha256:${"b".repeat(64)}` as const,
      contractRevision: "0.1.0",
      resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
    };
    expect(session.apply({
      eventId: "event.capability.first",
      sequence: 1,
      type: "capability_milestone_committed",
      payload: basePayload,
    }).applied).toBe(true);
    expect(session.apply({
      eventId: "event.capability.same-milestone",
      sequence: 2,
      type: "capability_milestone_committed",
      payload: basePayload,
    })).toMatchObject({ applied: false, duplicate: true, reason: "duplicate_milestone" });
    expect(session.apply({
      eventId: "event.capability.conflict",
      sequence: 2,
      type: "capability_milestone_committed",
      payload: { ...basePayload, resultingState: { ...basePayload.resultingState, focusSlots: 3 } },
    })).toMatchObject({ applied: false, duplicate: false, reason: "milestone_payload_conflict" });
    expect(session.apply({
      eventId: "event.capability.regression",
      sequence: 2,
      type: "capability_milestone_committed",
      payload: {
        ...basePayload,
        milestoneId: "regressive_milestone",
        resultingState: { expressionCapacityWords: 1, focusSlots: 2, maxMp: 26 },
      },
    })).toMatchObject({ applied: false, reason: "state_regression" });
    expect(session.nextSequence()).toBe(2);
  });

  it("rejects component regressions and leaves the expected sequence reusable", () => {
    const session = createSession();
    expect(session.apply({
      eventId: "event.mp.world-v2",
      sequence: 1,
      type: "mp_replaced",
      payload: { mp: { currentMp: 18, maxMp: 24, worldVersion: 2 } },
    }).applied).toBe(true);

    expect(session.apply({
      eventId: "event.mp.regression",
      sequence: 2,
      type: "mp_replaced",
      payload: { mp: { currentMp: 24, maxMp: 24, worldVersion: 1 } },
    })).toMatchObject({ applied: false, reason: "state_regression" });
    expect(session.nextSequence()).toBe(2);
  });
  it("upgrades integrity-valid pre-capability v0.2 saves without inferring progress from max MP", () => {
    const save = GameSession.create({
      sessionId: "save.legacy-v02.capacity",
      mp: { currentMp: 20, maxMp: 26, worldVersion: 4 },
      currentSceneId: "scene.n04.service",
    }).toSave();
    const legacy = structuredClone(save) as unknown as Record<string, any>;
    delete legacy.origin.capabilities;
    delete legacy.state.capabilities;
    legacy.integrity.digest = testDigest({
      schema: legacy.schema,
      sessionId: legacy.sessionId,
      origin: legacy.origin,
      state: legacy.state,
      eventLedger: legacy.eventLedger,
    });
    const loaded = GameSession.load(legacy);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.session.snapshot().capabilities).toEqual({
      expressionCapacityWords: 1,
      focusSlots: 1,
      revision: 0,
      appliedMilestones: {},
    });
    expect(loaded.session.snapshot().mp.maxMp).toBe(26);
  });
  it("rejects direct safe-range domain events and generic attack-capability aliases", () => {
    const transferSession = createSession();
    expect(transferSession.apply({
      eventId: "forge.safe-range.transfer", sequence: 1, type: "safe_range_transfer_passed",
      payload: {
        transactionId: "forge.transfer", writerEvent: "safe_range_transfer_passed",
        targetClass: "wood_dummy", targetId: "wood_dummy", normalizedVariantHash: "forged",
        promptLevel: 0, waterSource: "bound_existing", expectedCurrentMp: 24, expectedMpWorldVersion: 0,
        authorityProof: {
          requestHash: "forged", runtimeRevision: 0,
          frameEventId: "forge.safe-range.frame.transfer", frameHash: FORGED_SAFE_RANGE_SHA,
          manifestDigest: FORGED_SAFE_RANGE_SHA, sessionWorldRevision: 0, mpWorldVersion: 0,
        },
        physicsResult: { paidKineticBudgetEu: 1, transferredKineticEu: 1, damageHp: 0,
          targetHpBefore: 6, targetHpAfter: 6, livingOverlap: false },
      },
    })).toMatchObject({ applied: false, reason: "invalid_event" });
    expect(createSession().apply({
      eventId: "forge.safe-range.table", sequence: 1, type: "safe_range_material_table_completed",
      payload: { transactionId: "forge.table", writerEvent: "safe_range_material_table_completed",
        authorityProof: {
          requestHash: "forged", runtimeRevision: 0, targetId: "safe_range.material_table",
          frameEventId: "forge.safe-range.frame.table", frameHash: FORGED_SAFE_RANGE_SHA,
          manifestDigest: FORGED_SAFE_RANGE_SHA, sessionWorldRevision: 0, mpWorldVersion: 0,
        } },
    })).toMatchObject({ applied: false, reason: "invalid_event" });

    for (const [index, resultingState] of [
      { expressionCapacityWords: 4, focusSlots: 2, maxMp: 26 },
      { expressionCapacityWords: 2, focusSlots: 4, maxMp: 26 },
      { expressionCapacityWords: 2, focusSlots: 2, maxMp: 30 },
      { expressionCapacityWords: 5, focusSlots: 5, maxMp: 31 },
    ].entries()) {
      expect(createSession().apply({
        eventId: `forge.capability.alias.${index}`, sequence: 1, type: "capability_milestone_committed",
        payload: { milestoneId: `alias_${index}`, writerEvent: `alias_writer_${index}`,
          sourcePath: "data/fake.yaml", sourceDigest: `sha256:${"c".repeat(64)}`,
          contractRevision: "0.1.0", resultingState },
      })).toMatchObject({ applied: false, reason: "invalid_event" });
    }
  });

  it("rejects re-signed protected origin/state without authoritative domain ledger derivation", () => {
    const base = createSession().toSave();
    const resign = (save: GameSessionSave): GameSessionSave => {
      const unsigned = { schema: save.schema, sessionId: save.sessionId, origin: save.origin,
        state: save.state, eventLedger: save.eventLedger };
      return { ...save, integrity: { algorithm: save.integrity.algorithm, digest: testDigest(unsigned) } };
    };
    const originFlag = structuredClone(base) as unknown as Record<string, any>;
    originFlag.origin.world.flags["global:range_trial_permission"] = {
      flagId: "range_trial_permission", value: true, scope: "global", areaId: null, areaEpoch: null,
    };
    originFlag.state = structuredClone(originFlag.origin);
    expect(GameSession.load(resign(originFlag as GameSessionSave)).ok).toBe(false);
    expect(() => GameSession.fromReplayOrigin(originFlag.sessionId, originFlag.origin)).toThrow(/protected attack state/);

    const stateFlag = structuredClone(base) as unknown as Record<string, any>;
    stateFlag.state.world.flags["global:first_attack_signature_available"] = {
      flagId: "first_attack_signature_available", value: true, scope: "global", areaId: null, areaEpoch: null,
    };
    expect(GameSession.load(resign(stateFlag as GameSessionSave)).ok).toBe(false);

    const stateCapability = structuredClone(base) as unknown as Record<string, any>;
    stateCapability.state.capabilities.expressionCapacityWords = 4;
    stateCapability.state.capabilities.focusSlots = 4;
    stateCapability.state.mp.maxMp = 30;
    expect(GameSession.load(resign(stateCapability as GameSessionSave)).ok).toBe(false);
  });
  it("normalizes every integrity-valid v0.2 component-era save and rejects a corrupt one", () => {
    const base = GameSession.create({
      sessionId: "save.v02.component-matrix",
      mp: { currentMp: 20, maxMp: 26, worldVersion: 4 },
      currentSceneId: "scene.n04.service",
    }).toSave();
    const resign = (candidate: Record<string, any>): Record<string, any> => {
      candidate.integrity.digest = testDigest({
        schema: candidate.schema,
        sessionId: candidate.sessionId,
        origin: candidate.origin,
        state: candidate.state,
        eventLedger: candidate.eventLedger,
      });
      return candidate;
    };
    const onlyMissingLedger = structuredClone(base) as unknown as Record<string, any>;
    delete onlyMissingLedger.origin.lifeCorpseLedger;
    delete onlyMissingLedger.state.lifeCorpseLedger;
    const ledgerLoad = GameSession.load(resign(onlyMissingLedger));
    expect(ledgerLoad.ok).toBe(true);
    if (ledgerLoad.ok) expect(ledgerLoad.session.lifeCorpseLedgerSnapshot().lives).toEqual({});

    const missingBoth = structuredClone(base) as unknown as Record<string, any>;
    delete missingBoth.origin.capabilities;
    delete missingBoth.state.capabilities;
    delete missingBoth.origin.lifeCorpseLedger;
    delete missingBoth.state.lifeCorpseLedger;
    const bothLoad = GameSession.load(resign(missingBoth));
    expect(bothLoad.ok).toBe(true);
    if (bothLoad.ok) {
      expect(bothLoad.session.capabilitySnapshot().expressionCapacityWords).toBe(1);
      expect(bothLoad.session.lifeCorpseLedgerSnapshot().lives).toEqual({});
    }

    expect(GameSession.load(structuredClone(base)).ok).toBe(true);
    const corrupt = resign(structuredClone(missingBoth));
    corrupt.state.world.currentSceneId = "scene.tampered.after-signing";
    expect(GameSession.load(corrupt).ok).toBe(false);
  });
});

// Compile-time assertion that the public save shape remains serializable and versioned.
const _saveShape: Pick<GameSessionSave, "schema" | "eventLedger" | "integrity"> | null = null;
void _saveShape;
