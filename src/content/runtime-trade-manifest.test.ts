import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { computeRuntimeTradeDigest, readRuntimeTradeManifest } from "./runtime-trade-manifest";

describe("runtime settlement trade projection", () => {
  it("projects active merchants, authored prices, decay policy, WAL owners, and only real scene authorities", () => {
    const manifest = readRuntimeTradeManifest(generated);
    expect(Object.keys(manifest.activeMerchants).sort()).toEqual([
      "settlement.butcher", "settlement.grocer", "settlement.tanner",
    ]);
    expect(manifest.items["food.cooked_game_meat"]).toMatchObject({
      category: "cooked_meat", basePlayerSellCoin: 2, playerCanSell: true, buyer: "settlement.butcher",
    });
    expect(manifest.freshnessMultipliers).toMatchObject({
      fresh: 1, aging: 0.75, near_spoil: 0.5, raw: 0.85, slipping: 0.5,
      spoiled: null, decomposed: null, rotten: null, cured: 1, stable: 1,
    });
    expect(manifest.stationAuthorities).toEqual([
      { sceneId: "scene.valley.settlement", tradeEntryId: "settlement.trade.supply_stall", npcId: "settlement.npc.supply_trader",
        interactionId: "settlement.open_supply_trade", merchantIds: ["settlement.grocer"], targetId: "settlement.supply_stall", interactionPointPx: { x: 424, y: 456 } },
      { sceneId: "scene.valley.settlement", tradeEntryId: "settlement.trade.butcher_counter", npcId: "settlement.npc.butcher",
        interactionId: "settlement.open_butcher_trade", merchantIds: ["settlement.butcher"], targetId: "settlement.butcher_counter", interactionPointPx: { x: 488, y: 456 } },
      { sceneId: "scene.valley.settlement", tradeEntryId: "settlement.trade.tanner_counter", npcId: "settlement.npc.tanner",
        interactionId: "settlement.open_tanner_trade", merchantIds: ["settlement.tanner"], targetId: "settlement.tanner_counter", interactionPointPx: { x: 552, y: 456 } },
    ]);
    expect(manifest).toMatchObject({ quarterPriceMultiplier: .25, minimumSellQuality: .5,
      qualityMultiplierRange: [.25, 1], demandMultiplierRange: [.75, 1.15],
      restrictions: { spoiledMeatAccepted: false, rottenHideAccepted: false, rawHideAcceptedInPrologue: false },
      restock: { requiredDistinctEligibleEvents: 3, reloadRestocks: false, checkpointResetRestocks: false, repeatedEventRestocks: false },
    });
    expect(manifest.walParticipants).toEqual([
      "player_inventory_save", "player_wallet_save", "economy_ledger_save",
    ]);
  });

  it("rejects unsigned and re-signed contract tampering", () => {
    const tampered = structuredClone(generated) as any;
    tampered.trade.freshnessMultipliers.raw = 1;
    expect(() => readRuntimeTradeManifest(tampered)).toThrow(/digest mismatch/);

    delete tampered.trade.freshnessMultipliers.slipping;
    tampered.trade.sourceDigest = computeRuntimeTradeDigest(tampered.trade);
    expect(() => readRuntimeTradeManifest(tampered)).toThrow(/freshness slipping missing/);

    const duplicate = structuredClone(generated) as any;
    duplicate.trade.stationAuthorities.push(structuredClone(duplicate.trade.stationAuthorities[0]));
    duplicate.trade.sourceDigest = computeRuntimeTradeDigest(duplicate.trade);
    expect(() => readRuntimeTradeManifest(duplicate)).toThrow(/unique array/);

    const unknownTarget = structuredClone(generated) as any;
    unknownTarget.trade.stationAuthorities[0].targetId = "settlement.missing_counter";
    unknownTarget.trade.sourceDigest = computeRuntimeTradeDigest(unknownTarget.trade);
    expect(() => readRuntimeTradeManifest(unknownTarget)).toThrow(/does not match runtime scene/);
  });
});
