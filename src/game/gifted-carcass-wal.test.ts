import { describe, expect, it } from "vitest";
import { commitSessionProposal, proposeWildlifeLifeRegistration } from "../session/adapters";
import { GameSession } from "../session/game-session";
import {
  GameSessionProcessingWalBridge,
  InMemoryGameSessionAuthorityStore,
  InMemoryGameSessionPartitionStore,
  readGameSessionProcessingWalContract,
} from "../persistence/game-session-processing-wal";
import { InMemoryDurableCrossSaveWalStore, createCrossSaveReceiptId } from "../persistence/cross-save-wal";
import { GIFTED_RABBIT_ENTITY_ID, createGiftedRabbitLife } from "./gifted-carcass";
import { createStableWildlifeLifeId } from "./wildlife-state-machine";

describe("gifted carcass WAL integration", () => {
  it("commits the canonical gifted life death through every authored death owner before publishing its corpse", () => {
    let session = GameSession.create({ sessionId: "save.gifted.wal", mp: { currentMp: 8, maxMp: 8, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement" });
    const before = session.snapshot();
    const life = createGiftedRabbitLife({ playerSaveId: session.sessionId, regionId: "valley_prologue", worldTick: 0 });
    const registered = commitSessionProposal(session, proposeWildlifeLifeRegistration("gifted.wal.register", life));
    expect(registered.committed).toBe(true); session = registered.session;
    const authority = new InMemoryGameSessionAuthorityStore(session);
    const partitions = new InMemoryGameSessionPartitionStore(session.toSave());
    const bridge = new GameSessionProcessingWalBridge(authority, new InMemoryDurableCrossSaveWalStore(), partitions);
    const prepared = bridge.prepareDeath({ transactionId: "caller.must.not.choose", lifeInstanceId: life.lifeInstanceId,
      expectedLifeRevision: 0, damage: life.maxHp, causeClass: "clean_tool", worldTick: 0,
      position: { sceneId: "scene.valley.settlement", x: 488, y: 456 } });
    expect(life.lifeInstanceId).toMatch(/^wildlife-life:sha256:[0-9a-f]{64}$/);
    expect(life.lifeInstanceId).toBe(createStableWildlifeLifeId({ regionSaveId: life.regionSaveId,
      entityId: GIFTED_RABBIT_ENTITY_ID, spawnGeneration: life.spawnGeneration, spawnSequence: life.spawnSequence }));
    expect(prepared.participants.map((participant) => participant.saveOwner))
      .toEqual(readGameSessionProcessingWalContract().registeredTransactionKinds.death);
    expect(Object.keys(authority.read().snapshot().lifeCorpseLedger.corpses)).toHaveLength(0);
    expect(bridge.commit(prepared.transactionId, 0).state).toBe("applied");
    const after = authority.read().snapshot();
    expect(Object.keys(after.lifeCorpseLedger.corpses)).toHaveLength(1);
    expect(after.receiptIndex[createCrossSaveReceiptId(prepared.transactionId, "death")]).toBeDefined();
    expect(after.mp).toEqual(before.mp); expect(after.learning).toEqual(before.learning);
    expect(after.economy).toEqual(before.economy); expect(after.survival).toEqual(before.survival);
  });
});
