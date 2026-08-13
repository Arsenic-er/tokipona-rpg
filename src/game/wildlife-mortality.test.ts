import { describe, expect, it } from "vitest";
import {
  createWildlifeLifeRecord,
  ZERO_WILDLIFE_REWARD_DELTA,
  type WildlifeDamageRequest,
  type WildlifeAgeClass,
} from "./life-corpse-ledger";
import {
  GameSessionWildlifeLifeLedgerView,
  GameSessionWildlifeMortalityPort,
} from "./wildlife-mortality";
import {
  commitSessionProposal,
  proposeWildlifeLifeRegistration,
} from "../session/adapters";
import {
  GameSession,
  replayGameSession,
} from "../session/game-session";

const createSession = (): GameSession => GameSession.create({
  sessionId: "save.mortality.test",
  mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: "scene.valley.den_bypass",
});

const register = (session: GameSession, ageClass: WildlifeAgeClass = "adult"): GameSession => {
  const life = createWildlifeLifeRecord({
    lifeInstanceId: ageClass === "adult" ? "life.rabbit.adult.1" : "life.rabbit.juvenile.1",
    regionSaveId: "region-save.valley.1",
    regionId: "valley_prologue",
    entityId: "wildlife.rabbit.valley",
    species: "rabbit",
    ageClass,
    spawnGeneration: 0,
    spawnSequence: ageClass === "adult" ? 1 : 2,
    harvestProfileId: "harvest.rabbit.v0.1",
    maxHp: 8,
    registeredAtWorldTick: 10,
  });
  const commit = commitSessionProposal(session, proposeWildlifeLifeRegistration(`register.${ageClass}`, life));
  expect(commit.committed).toBe(true);
  return commit.session;
};

const request = (
  transactionId: string,
  damage: number,
  expectedLifeRevision = 0,
  lifeInstanceId = "life.rabbit.adult.1",
): WildlifeDamageRequest => ({
  transactionId,
  lifeInstanceId,
  expectedLifeRevision,
  damage,
  causeClass: "clean_tool",
  worldTick: 20,
  position: { sceneId: "scene.valley.den_bypass", x: 128, y: 96 },
});

describe("GameSession wildlife mortality port", () => {
  it("is feature-disabled until its exact life is validated and registered", () => {
    const session = createSession();
    expect(new GameSessionWildlifeLifeLedgerView(session).featureEnabled).toBe(false);
    const port = new GameSessionWildlifeMortalityPort(session, "life.rabbit.adult.1");
    expect(port.featureEnabled).toBe(false);
    expect(port.applyDamage(session, request("damage.disabled", 1))).toMatchObject({
      committed: false,
      reason: "feature_disabled",
      session,
    });
  });

  it("commits nonfatal damage with CAS and no rewards or world flags", () => {
    const session = register(createSession());
    const port = new GameSessionWildlifeMortalityPort(session, "life.rabbit.adult.1");
    const result = port.applyDamage(session, request("damage.rabbit.1", 3));
    expect(result).toMatchObject({ committed: true, duplicate: false, reason: "committed" });
    expect(result.receipt).toMatchObject({ currentHp: 5, lifeRevision: 1, rewardDelta: ZERO_WILDLIFE_REWARD_DELTA });
    expect(result.session.snapshot().world.flags).toEqual({});
    expect(result.session.snapshot().receiptIndex["wildlife:damage.rabbit.1"]).toMatchObject({
      domain: "wildlife",
      receiptId: "wildlife:damage.rabbit.1",
    });
    expect(port.applyDamage(result.session, request("damage.stale", 1, 0))).toMatchObject({
      committed: false,
      reason: "life_revision_conflict",
    });
  });

  it("atomically tombstones one life, creates one corpse and returns the prior receipt on another death tx", () => {
    const session = register(createSession());
    const port = new GameSessionWildlifeMortalityPort(session, "life.rabbit.adult.1");
    const lethal = request("death.rabbit.1", 8);
    const first = port.applyDamage(session, lethal);
    expect(first).toMatchObject({ committed: true, reason: "committed" });
    expect(first.receipt).toMatchObject({ currentHp: 0, deathEventId: expect.any(String), corpseId: expect.any(String) });
    expect(first.receipt?.rewardDelta).toEqual(ZERO_WILDLIFE_REWARD_DELTA);
    expect(first.session.snapshot().receiptIndex["wildlife:death.rabbit.1"]).toMatchObject({
      domain: "wildlife",
      receiptId: "wildlife:death.rabbit.1",
    });
    const ledger = first.session.lifeCorpseLedgerSnapshot();
    expect(Object.keys(ledger.corpses)).toHaveLength(1);
    expect(ledger.lives[lethal.lifeInstanceId]).toMatchObject({ state: "dead", currentHp: 0 });
    expect(ledger.corpses[first.receipt!.corpseId!].tissueSlots).toMatchObject([
      { tissueSlotId: "meat", remainingQuantity: 2 },
      { tissueSlotId: "hide", remainingQuantity: 1 },
    ]);

    const duplicate = port.applyDamage(first.session, lethal);
    expect(duplicate).toMatchObject({ committed: false, duplicate: true, reason: "duplicate" });
    const conflict = port.applyDamage(first.session, { ...lethal, damage: 9 });
    expect(conflict).toMatchObject({ committed: false, duplicate: false, reason: "transaction_conflict" });
    const secondTx = port.applyDamage(first.session, request("death.rabbit.again", 8));
    expect(secondTx).toMatchObject({ committed: false, duplicate: true, reason: "life_already_tombstoned" });
    expect(secondTx.receipt).toEqual(first.receipt);
    expect(Object.keys(secondTx.session.lifeCorpseLedgerSnapshot().corpses)).toHaveLength(1);
    expect(secondTx.session.events()).toHaveLength(first.session.events().length);
  });

  it("preserves the ledger through reset, save/load and replay", () => {
    const session = register(createSession());
    const port = new GameSessionWildlifeMortalityPort(session, "life.rabbit.adult.1");
    const killed = port.applyDamage(session, request("death.persistence", 8)).session;
    const beforeReset = killed.lifeCorpseLedgerSnapshot();
    expect(killed.apply({
      eventId: "reset.after.death",
      sequence: killed.nextSequence(),
      type: "area_reset",
      payload: { areaId: "scene.valley.den_bypass", respawnSceneId: "scene.valley.den_bypass" },
    }).applied).toBe(true);
    expect(killed.lifeCorpseLedgerSnapshot()).toEqual(beforeReset);
    const save = killed.toSave();
    const loaded = GameSession.load(structuredClone(save));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.lifeCorpseLedgerSnapshot()).toEqual(beforeReset);
    const replayed = replayGameSession(save.sessionId, save.origin, save.eventLedger);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.session.snapshot()).toEqual(save.state);
  });

  it("creates juvenile corpses with zero tissue slots and rejects corrupt saves", () => {
    const session = register(createSession(), "juvenile");
    const lifeId = "life.rabbit.juvenile.1";
    const port = new GameSessionWildlifeMortalityPort(session, lifeId);
    const killed = port.applyDamage(session, request("death.juvenile", 8, 0, lifeId)).session;
    const corpse = new GameSessionWildlifeLifeLedgerView(killed).corpseForLife(lifeId);
    expect(corpse?.tissueSlots).toEqual([]);
    const corrupt = structuredClone(killed.toSave());
    (corrupt.state.lifeCorpseLedger.corpses[corpse!.corpseId].tissueSlots as unknown[]) = [{ bad: true }];
    expect(GameSession.load(corrupt).ok).toBe(false);
  });
});
