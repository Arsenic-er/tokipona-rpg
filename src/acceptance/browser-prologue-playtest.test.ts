import { describe, expect, it } from "vitest";
import { GameSession, type GameSessionEvent, type GameSessionState } from "../session/game-session";
import {
  BROWSER_PROLOGUE_PLAYTEST_SCHEMA,
  BrowserProloguePlaytest,
  anonymizedProloguePlaytestSessionId,
  prologueActiveNewWordCountForScene,
  readBrowserProloguePlaytestSave,
} from "./browser-prologue-playtest";
import type { BrowserTelemetryStorage } from "./browser-prologue-telemetry";
import type { ExclusiveActivitySnapshot } from "./prologue-telemetry";

const MINUTE = 60_000;

class MemoryStorage implements BrowserTelemetryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const activity = (
  worldPeoplePhysicsActiveMs: number,
  languageActiveMs: number,
  longExplanationActiveMs: number,
  activeKind: ExclusiveActivitySnapshot["activeKind"] = "world_people_physics",
): ExclusiveActivitySnapshot => Object.freeze({
  activeKind,
  observedAtMs: worldPeoplePhysicsActiveMs + languageActiveMs + longExplanationActiveMs,
  totalsMs: Object.freeze({
    world_people_physics: worldPeoplePhysicsActiveMs,
    language: languageActiveMs,
    long_explanation: longExplanationActiveMs,
    pause: 0,
    idle: 0,
    settings: 0,
    optional_free_roam: 0,
  }),
  contentActiveMs: worldPeoplePhysicsActiveMs + languageActiveMs + longExplanationActiveMs,
  excludedMs: 0,
});

const event = (sequence: number, type: GameSessionEvent["type"], payload: unknown): GameSessionEvent => ({
  eventId: `playtest.event.${sequence}`,
  sequence,
  type,
  payload,
}) as unknown as GameSessionEvent;

const state = (
  sceneId: string,
  events: readonly GameSessionEvent[],
  needs: Readonly<{ satiety: number; hydration: number }> = { satiety: 80, hydration: 75 },
): GameSessionState => {
  const initial = GameSession.create({
    sessionId: "playtest.browser.session",
    mp: { currentMp: 8, maxMp: 8, worldVersion: 0 },
    currentSceneId: sceneId,
  }).snapshot();
  return Object.freeze({
    ...initial,
    revision: events.length,
    lastEventSequence: events.length,
    world: Object.freeze({ ...initial.world, currentSceneId: sceneId }),
    survival: Object.freeze({ ...initial.survival, satiety: needs.satiety, hydration: needs.hydration }),
  });
};

const frame = (
  sceneId: string,
  events: readonly GameSessionEvent[],
  timer: ExclusiveActivitySnapshot,
  survivalUiActive = false,
  needs?: Readonly<{ satiety: number; hydration: number }>,
) => Object.freeze({
  activity: timer,
  survivalUiActive,
  session: state(sceneId, events, needs),
  events,
  sceneId,
});

describe("browser prologue playtest observation", () => {
  it("persists aggregate-only observations and emits the strict 22-field sample after 180 content minutes", () => {
    const storage = new MemoryStorage();
    const key = "playtest";
    const target = BrowserProloguePlaytest.bootstrap({
      storage,
      key,
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.arrival_shelf", [], activity(0, 0, 0)),
    });

    target.observeFrame(frame("scene.valley.arrival_shelf", [], activity(MINUTE, 0, 0), true));
    const accepted = event(1, "quest_stage_set", {
      questId: "ch01_settlement_orientation", stageId: "accepted", stageOrdinal: 1,
    });
    const language = event(2, "learning_evidence_committed", { evidence: { evidenceType: "active_retrieval_submitted" } });
    target.observeFrame(frame("scene.valley.settlement", [accepted, language], activity(50 * MINUTE, 10 * MINUTE, 0)));
    target.beginSoftFailure(activity(50 * MINUTE, 10 * MINUTE, 0));
    target.completeSoftFailure(activity(51 * MINUTE, 10 * MINUTE, 0));

    const relief = event(3, "world_flag_set", {
      flagId: "public_well_used", value: true, scope: "region", regionId: "valley_prologue",
    });
    const completed = event(4, "quest_stage_set", {
      questId: "ch01_settlement_orientation", stageId: "completed", stageOrdinal: 3,
    });
    const permission = event(5, "attack_prerequisites_verified", {
      transactionId: "permission", writerEvent: "attack_prerequisites_verified", contractId: "attack.water",
    });
    target.observeFrame(frame(
      "scene.valley.high_cistern",
      [accepted, language, relief, completed, permission],
      activity(85 * MINUTE, 30 * MINUTE, 5 * MINUTE),
      false,
      { satiety: 70, hydration: 74 },
    ));

    const signature = event(6, "safe_range_transfer_passed", {
      transactionId: "signature", writerEvent: "safe_range_transfer_passed",
    });
    const finalActivity = activity(126 * MINUTE, 36 * MINUTE, 18 * MINUTE);
    target.observeFrame(frame(
      "scene.valley.underground_order_node",
      [accepted, language, relief, completed, permission, signature],
      finalActivity,
      false,
      { satiety: 68.8, hydration: 71.2 },
    ));

    const sample = target.toSample(finalActivity);
    expect(sample).toMatchObject({
      schemaVersion: "prologue.playtest-session.v0.1",
      contentActiveMs: 180 * MINUTE,
      survivalUiActiveMs: MINUTE,
      languageInteractionCount: 1,
      needsInterruptedLanguageInteractionCount: 0,
      freeFoodWaterDiscoveryMs: 120 * MINUTE,
      rangeTrialPermissionContentMs: 120 * MINUTE,
      firstAttackSignatureContentMs: 180 * MINUTE,
      forcedHuntCount: 0,
      wildlifeHarmEventCount: 0,
      nonviolentJobIncomeCoin: 10,
      nonviolentJobActiveMs: 60 * MINUTE,
      minimumNeedsValueObserved: 68,
      maximumActiveNewWordsInAnySegment: 2,
    });
    expect(sample.softFailureRecoveryDurationsMs).toEqual([MINUTE]);

    const saved = readBrowserProloguePlaytestSave(JSON.parse(storage.getItem(key)!));
    expect(saved).toMatchObject({
      schema: BROWSER_PROLOGUE_PLAYTEST_SCHEMA,
      observationComplete: true,
      processedEventSequence: 6,
    });
    const serialized = storage.getItem(key)!;
    expect(serialized).not.toMatch(/raw|utterance|lotId|savePayload|playerPosition|damageHp/);

    const loaded = BrowserProloguePlaytest.bootstrap({
      storage,
      key,
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.underground_order_node", [accepted, language, relief, completed, permission, signature], finalActivity),
    });
    expect(loaded.toSample(finalActivity)).toEqual(sample);
  });

  it("fails closed after corrupt observation storage or a divergent ledger prefix", () => {
    const corruptStorage = new MemoryStorage();
    corruptStorage.setItem("playtest", "{broken");
    const corrupt = BrowserProloguePlaytest.bootstrap({
      storage: corruptStorage,
      key: "playtest",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.arrival_shelf", [], activity(0, 0, 0)),
    });
    expect(corrupt.snapshot().observationComplete).toBe(false);
    expect(() => corrupt.toSample(activity(0, 0, 0))).toThrow(/incomplete/);

    const storage = new MemoryStorage();
    const first = BrowserProloguePlaytest.bootstrap({
      storage,
      key: "prefix",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.arrival_shelf", [], activity(0, 0, 0)),
    });
    const original = event(1, "scene_entered", { sceneId: "scene.valley.stream_section" });
    first.observeFrame(frame("scene.valley.stream_section", [original], activity(MINUTE, 0, 0)));
    first.flush();
    const forged = event(1, "scene_entered", { sceneId: "scene.valley.settlement" });
    const loaded = BrowserProloguePlaytest.bootstrap({
      storage,
      key: "prefix",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.settlement", [forged], activity(MINUTE, 0, 0)),
    });
    expect(loaded.snapshot().observationComplete).toBe(false);
  });

  it("rejects unknown fields and re-signed invalid counters", () => {
    const storage = new MemoryStorage();
    const target = BrowserProloguePlaytest.bootstrap({
      storage,
      key: "strict",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.arrival_shelf", [], activity(0, 0, 0)),
    });
    const saved = target.snapshot();
    expect(() => readBrowserProloguePlaytestSave({ ...saved, rawText: "telo" })).toThrow(/unknown|missing/);
    expect(() => readBrowserProloguePlaytestSave({ ...saved, checksum: `sha256:${"0".repeat(64)}` })).toThrow(/checksum/);
  });

  it("refuses to export an unresolved soft failure and records the next successful recovery", () => {
    const storage = new MemoryStorage();
    const target = BrowserProloguePlaytest.bootstrap({
      storage,
      key: "recovery",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.arrival_shelf", [], activity(0, 0, 0)),
    });
    target.beginSoftFailure(activity(MINUTE, 0, 0));
    target.observeFrame(frame("scene.valley.arrival_shelf", [], activity(2 * MINUTE, 0, 0)));
    expect(() => target.toSample(activity(2 * MINUTE, 0, 0))).toThrow(/incomplete/);
    target.completeSoftFailure(activity(2 * MINUTE, 0, 0));
    expect(target.snapshot().softFailureRecoveryDurationsMs).toEqual([MINUTE]);
  });

  it("counts wildlife harm, wildlife-product income time, and duplicate currency receipts without persisting lot IDs", () => {
    const storage = new MemoryStorage();
    const target = BrowserProloguePlaytest.bootstrap({
      storage,
      key: "economy",
      sessionId: "playtest.browser.session",
      frame: frame("scene.valley.den_bypass", [], activity(0, 0, 0)),
    });
    const harm = event(1, "wildlife_damage_committed", { damage: 1 });
    target.observeFrame(frame("scene.valley.den_bypass", [harm], activity(5 * MINUTE, 0, 0)));
    const processing = event(2, "wildlife_processing_committed", { action: "harvest" });
    target.observeFrame(frame("scene.valley.den_bypass", [harm, processing], activity(10 * MINUTE, 0, 0)));
    const sale = event(3, "verified_trade_sale_committed", {
      quote: {
        totalCoin: 4,
        lineItems: [{ itemId: "food.cooked_game_meat" }],
      },
    });
    const base = state("scene.valley.settlement", [harm, processing, sale]);
    const duplicatedReceipt = Object.freeze({
      transactionId: "trade.duplicate.a",
      quoteId: "quote.duplicate",
      merchantId: "settlement.butcher",
      lotId: "private.lot.must.not.persist",
      itemId: "food.cooked_game_meat",
      quantity: 1,
      coinDelta: 4,
      committedWorldTick: 0,
    }) as GameSessionState["economy"]["tradeReceipts"][number];
    const withDuplicate = Object.freeze({
      ...base,
      economy: Object.freeze({
        ...base.economy,
        tradeReceipts: Object.freeze([
          duplicatedReceipt,
          Object.freeze({ ...duplicatedReceipt, transactionId: "trade.duplicate.b" }),
        ]),
      }),
    });
    target.observeFrame({
      activity: activity(15 * MINUTE, 0, 0),
      survivalUiActive: false,
      session: withDuplicate,
      events: [harm, processing, sale],
      sceneId: "scene.valley.settlement",
    });

    expect(target.snapshot()).toMatchObject({
      wildlifeHarmEventCount: 1,
      huntingIncomeCoin: 4,
      huntingActiveMs: 10 * MINUTE,
      duplicateCorpseLotCurrencyCount: 1,
    });
    expect(storage.getItem("economy")).not.toContain("private.lot.must.not.persist");
  });

  it("derives active-word focus only from verified scene and segment manifests", () => {
    expect(prologueActiveNewWordCountForScene("scene.valley.arrival_shelf")).toBe(0);
    expect(prologueActiveNewWordCountForScene("scene.valley.high_cistern")).toBe(2);
    expect(() => prologueActiveNewWordCountForScene("scene.valley.safe_range")).toThrow(/no authored segment focus/);
    expect(() => prologueActiveNewWordCountForScene("scene.valley.unknown")).toThrow(/absent/);
    expect(anonymizedProloguePlaytestSessionId("browser-prologue-raw-player-id"))
      .toMatch(/^session\.sha256\.[0-9a-f]{64}$/);
    expect(anonymizedProloguePlaytestSessionId("browser-prologue-raw-player-id"))
      .not.toContain("raw-player-id");
  });
});
