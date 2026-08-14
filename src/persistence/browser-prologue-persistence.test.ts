import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import { PROLOGUE_STREAM_SCENE_ID } from "../game/prologue-arrival-stream";
import { PrologueFlowSession } from "../game/prologue-flow";
import type { P0LearningActionId } from "../game/p0-learning-contract";
import {
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PrologueSettlementSession,
  createPrologueSettlementInitialSession,
} from "../game/prologue-settlement";
import {
  BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA,
  type LocalStorageLike,
} from "./browser-game-session-wal";
import { bootstrapBrowserPrologue, persistBrowserPrologueCheckpoint } from "./browser-prologue-persistence";

class MemoryLocalStorage implements LocalStorageLike {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

const keys = { checkpointKey: "prologue", companionKey: "prologue.wal" };
const p0Manifest = readRuntimeP0CurriculumManifest(generated);
const advanceTo = (runtime: ReturnType<typeof bootstrapBrowserPrologue>, sceneId: string): void => {
  for (let tick = 0; tick < 1_000 && runtime.flow.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    runtime.flow.advanceTicks(1, { moveX: 1 });
  }
  expect(runtime.flow.snapshot().runtime.sceneId).toBe(sceneId);
};
const moveTo = (runtime: ReturnType<typeof bootstrapBrowserPrologue>, x: number): void => {
  for (let tick = 0; tick < 1_000 && Math.abs(runtime.flow.snapshot().runtime.player.position.x - x) > 8; tick += 1) {
    runtime.flow.advanceTicks(1, { moveX: runtime.flow.snapshot().runtime.player.position.x < x ? 1 : -1 });
  }
};

describe("browser prologue companion-first bootstrap", () => {
  it("does not overwrite an existing companion during page bootstrap", () => {
    const storage = new MemoryLocalStorage();
    const first = bootstrapBrowserPrologue(storage, keys, () => "browser.bootstrap.saved");
    advanceTo(first, PROLOGUE_STREAM_SCENE_ID);
    first.flow.pushLooseStone("browser.bootstrap.route");
    advanceTo(first, PROLOGUE_SETTLEMENT_SCENE_ID);
    persistBrowserPrologueCheckpoint(storage, keys, first);
    const durableBefore = storage.getItem(keys.companionKey);

    const restarted = bootstrapBrowserPrologue(storage, keys, () => "browser.bootstrap.must-not-run");
    expect(restarted.flow.session.sessionId).toBe("browser.bootstrap.saved");
    expect(restarted.flow.snapshot().runtime.sceneId).toBe(PROLOGUE_SETTLEMENT_SCENE_ID);
    expect(storage.getItem(keys.companionKey)).toBe(durableBefore);
  });

  it("recovers a formal gift from companion truth when the user checkpoint was not saved again", () => {
    const storage = new MemoryLocalStorage();
    const first = bootstrapBrowserPrologue(storage, keys, () => "browser.crash.after-gift");
    advanceTo(first, PROLOGUE_STREAM_SCENE_ID); first.flow.pushLooseStone("browser.crash.route");
    advanceTo(first, PROLOGUE_SETTLEMENT_SCENE_ID);
    persistBrowserPrologueCheckpoint(storage, keys, first); // explicit checkpoint before the formal action
    const staleCheckpoint = storage.getItem(keys.checkpointKey);
    moveTo(first, 488);
    expect(first.flow.acceptGiftedRabbitCarcass("browser.crash.gift")).toMatchObject({ accepted: true });
    expect(storage.getItem(keys.checkpointKey)).toBe(staleCheckpoint); // process dies before another click on Save

    const restarted = bootstrapBrowserPrologue(storage, keys, () => "must-not-replace");
    expect(Object.values(restarted.flow.snapshot().session.lifeCorpseLedger.corpses)).toHaveLength(1);
    expect(restarted.flow.snapshot().session.receiptIndex[
      "gifted-carcass:browser.crash.after-gift:n02.rabbit.v0.1"
    ]).toBeDefined();
  });

  it("migrates the old v0.2 naked GameSession when v0.3 and companion are absent", () => {
    const storage = new MemoryLocalStorage();
    const migrationKeys = {
      checkpointKey: "tokipona.rpg.prologue.v0.3",
      companionKey: "tokipona.rpg.prologue.v0.3.cross-save-wal",
      legacyCheckpointKeys: ["tokipona.rpg.prologue.v0.2"],
    } as const;
    const legacy = PrologueFlowSession.fresh({ sessionId: "browser.legacy.v0.2" }).toSave();
    storage.setItem(migrationKeys.legacyCheckpointKeys[0], JSON.stringify(legacy));

    const runtime = bootstrapBrowserPrologue(storage, migrationKeys, () => "must-not-create");

    expect(runtime.flow.session.sessionId).toBe("browser.legacy.v0.2");
    expect(storage.getItem(migrationKeys.companionKey)).not.toBeNull();
    expect(JSON.parse(storage.getItem(migrationKeys.checkpointKey)!)).toMatchObject({
      schema: BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA,
      session: { sessionId: "browser.legacy.v0.2" },
    });
  });
  it("writes a full checked envelope to the primary checkpoint key", () => {
    const storage = new MemoryLocalStorage();
    const runtime = bootstrapBrowserPrologue(storage, keys, () => "browser.envelope");
    const envelope = persistBrowserPrologueCheckpoint(storage, keys, runtime);
    expect(JSON.parse(storage.getItem(keys.checkpointKey)!)).toEqual(envelope);
    expect(envelope.session.sessionId).toBe("browser.envelope");
  });

  it("recovers a protected core-120 action from companion truth before another user checkpoint", () => {
    const storage = new MemoryLocalStorage();
    const seed = new PrologueSettlementSession(createPrologueSettlementInitialSession({ sessionId: "browser.core120" }));
    for (let tick = 0; tick < 760 && seed.snapshot().runtime.player.position.x < 608; tick += 1) {
      seed.advanceTicks(1, { moveX: 1 });
    }
    for (const wordId of p0Manifest.scope.wordIds) {
      const targetState = p0Manifest.words[wordId].targetState;
      const prerequisiteKinds = targetState === "attuned"
        ? (["discover", "attune"] as const)
        : targetState === "grounded"
          ? (["discover", "attune", "context_0"] as const)
          : (["discover", "attune", "context_0", "context_1"] as const);
      for (const [index, kind] of prerequisiteKinds.entries()) {
        const actionId = `p0.${wordId}.${kind}` as P0LearningActionId;
        expect(seed.commitP0LearningAction(actionId, `browser.core120.p0.${wordId}.${index}`), actionId)
          .toMatchObject({ accepted: true });
      }
    }
    storage.setItem(keys.checkpointKey, JSON.stringify(seed.toSave()));
    const first = bootstrapBrowserPrologue(storage, keys, () => "must-not-replace-seed");
    moveTo(first, 608);
    const positionBefore = first.flow.snapshot().runtime.player.position;
    persistBrowserPrologueCheckpoint(storage, keys, first);
    const stalePrimary = storage.getItem(keys.checkpointKey);
    expect(first.flow.performCore120LearningAction("browser.core120.akesi.discover", "core120.akesi.discover"))
      .toMatchObject({ accepted: true, result: { accepted: true } });
    expect(first.flow.snapshot().runtime.player.position).toEqual(positionBefore);
    expect(storage.getItem(keys.checkpointKey)).toBe(stalePrimary);

    const restarted = bootstrapBrowserPrologue(storage, keys, () => "must-not-replace-core120");
    expect(restarted.flow.core120LearningView().words.find((word) => word.wordId === "akesi"))
      .toMatchObject({ currentState: "discovered", nextActionId: "core120.akesi.attune" });
    expect(restarted.flow.core120LearningView()).toMatchObject({ p0PrerequisiteComplete: true,
      completedSemanticActionCount: 1 });
  });
});
