import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "../game/economy-state";
import { GameSession, GAME_SESSION_INTEGRITY_ALGORITHM } from "./game-session";

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
};

const digest = (value: unknown): string => {
  const text = JSON.stringify(canonicalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const resign = (save: Record<string, any>): Record<string, any> => {
  save.integrity = {
    algorithm: GAME_SESSION_INTEGRITY_ALGORITHM,
    digest: digest({
      schema: save.schema,
      sessionId: save.sessionId,
      origin: save.origin,
      state: save.state,
      eventLedger: save.eventLedger,
    }),
  };
  return save;
};

describe("GameSession economy migration", () => {
  it("upgrades an integrity-valid v0.2 summary without losing any legacy lot identity or revision", () => {
    const save = GameSession.create({
      sessionId: "save.legacy-v02.economy",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.n02.settlement",
    }).toSave();
    const legacySummary = {
      coin: 11,
      walletRevision: 7,
      inventoryRevision: 13,
      lots: [{
        lotId: "legacy.unique.lot",
        itemId: "legacy.arbitrary_removed_item",
        quantity: 4,
        ownershipRevision: 8,
        freshnessRevision: 6,
      }],
    };
    const legacy = structuredClone(save) as unknown as Record<string, any>;
    legacy.origin.economy = structuredClone(legacySummary);
    legacy.state.economy = structuredClone(legacySummary);
    const loaded = GameSession.load(resign(legacy));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.session.snapshot().economy).toMatchObject({
      coin: 11,
      walletRevision: 7,
      inventoryRevision: 13,
      quoteSequence: 0,
    });
    expect(loaded.session.snapshot().economy.lots).toEqual([expect.objectContaining({
      ...legacySummary.lots[0],
      originKind: "legacy_unknown",
      economyEligible: false,
      naturalFraction: 0,
    })]);
  });

  it("rejects a corrupt full-economy schema even when the outer checksum is recomputed", () => {
    const legacy = structuredClone(GameSession.create({
      sessionId: "save.corrupt.economy",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.n02.settlement",
    }).toSave()) as unknown as Record<string, any>;
    legacy.origin.economy.schema = "tokipona.session-economy.corrupt";
    legacy.state.economy.schema = "tokipona.session-economy.corrupt";
    expect(GameSession.load(resign(legacy))).toEqual({ ok: false, error: "invalid_save" });
  });

  it("preserves all economy ledgers across area reset and save/replay", () => {
    const economy = {
      ...createEmptySessionEconomy(),
      coin: 3,
      walletRevision: 1,
      workOrders: [{
        workOrderId: "work.future.001",
        recipeId: "recipe.future.001",
        inputLotIds: ["lot.input.001"],
        status: "queued" as const,
        revision: 0,
      }],
      processingReceipts: [{
        transactionId: "process.future.001",
        workOrderId: "work.future.001",
        inputLotIds: ["lot.input.001"],
        outputLotIds: ["lot.output.001"],
        committedWorldTick: 22,
      }],
    };
    const session = GameSession.create({
      sessionId: "save.reset.economy",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.n06.wildlife",
      economy,
    });
    const before = session.snapshot().economy;
    expect(session.apply({
      eventId: "event.reset.economy",
      sequence: 1,
      type: "area_reset",
      payload: { areaId: "n06" },
    }).applied).toBe(true);
    expect(session.snapshot().economy).toEqual(before);
    const loaded = GameSession.fromSave(session.toSave());
    expect(loaded.snapshot().economy).toEqual(before);
  });

  it("does not let a generic lot CAS launder legacy_unknown provenance into a tradeable item", () => {
    const session = GameSession.create({
      sessionId: "save.legacy-lot.laundering",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.n02.settlement",
      economy: {
        coin: 0,
        walletRevision: 0,
        inventoryRevision: 4,
        lots: [{
          lotId: "legacy.arbitrary.lot",
          itemId: "legacy.removed_item",
          quantity: 2,
          ownershipRevision: 3,
          freshnessRevision: 1,
        }],
      },
    });
    const lot = session.snapshot().economy.lots[0]!;
    expect(session.apply({
      eventId: "event.legacy-lot.launder",
      sequence: 1,
      type: "economy_lot_changed",
      payload: {
        lotId: lot.lotId,
        expectedInventoryRevision: 4,
        nextInventoryRevision: 5,
        expectedOwnershipRevision: 3,
        expectedFreshnessRevision: 1,
        nextLot: {
          ...lot,
          itemId: "food.cooked_game_meat",
          originKind: "natural",
          naturalFraction: 1,
          economyEligible: true,
          ownershipRevision: 4,
        },
      },
    })).toMatchObject({ applied: false, reason: "invalid_event" });
    expect(session.snapshot().economy.lots[0]).toEqual(lot);
  });
});
