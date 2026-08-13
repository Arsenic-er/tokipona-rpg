import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy, isSessionEconomyState, type SessionEconomyState } from "./economy-state";
import {
  createDeterministicCorpseId,
  createDeterministicDeathEventId,
  createEmptyLifeCorpseLedger,
  tissueSlotsForLife,
  WILDLIFE_ECONOMY_ID,
  type SessionLifeCorpseLedger,
  type SessionWildlifeCorpseRecord,
  type WildlifeAgeClass,
} from "./life-corpse-ledger";
import type { TradeLot } from "./trade";
import {
  createCrossSaveOutputId,
  createCrossSaveReceiptId,
  createCrossSaveTransactionId,
} from "../persistence/cross-save-wal";
import {
  applyWildlifeProcessingAction,
  decayWildlifeLotToTick,
  createWildlifeProcessingTransactionId,
  wildlifeProcessingManifest,
  type HarvestAction,
  type WildlifeLotProvenance,
  type WildlifeProcessingAction,
  type WildlifeProcessingAggregate,
  type WildlifeProcessingWorkOrder,
  type WildlifeProcessingApplyContext,
} from "./wildlife-processing";

const player = "player.test";
const corpseAggregate = (species: "rabbit" | "fox", ageClass: WildlifeAgeClass = "adult", causeClass = "clean_tool"): WildlifeProcessingAggregate => {
  const lifeInstanceId = `life.${species}.${ageClass}.${causeClass}`;
  const regionSaveId = "save.valley.test";
  const deathEventId = createDeterministicDeathEventId(regionSaveId, lifeInstanceId);
  const corpseId = createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, lifeInstanceId);
  const profileId = `harvest.${species}.v0.1`;
  const life = {
    lifeInstanceId, regionSaveId, regionId: "valley", entityId: `wildlife.${species}.test`, species, ageClass,
    spawnGeneration: 1, spawnSequence: 1, harvestProfileId: profileId, state: "dead" as const,
    maxHp: 10, currentHp: 0, lifeRevision: 1, registeredAtWorldTick: 0,
    deathTransactionId: `death.${species}`, deathEventId, corpseId,
  };
  const corpse: SessionWildlifeCorpseRecord = {
    corpseId, lifeInstanceId, regionId: "valley", entityId: life.entityId, species, ageClass, harvestProfileId: profileId,
    deathEventId, deathTick: 0, causeClass, position: { sceneId: "scene.test", x: 1, y: 2 }, decayState: "fresh",
    contaminationMu: 0, lastDecayEvalTick: 0, tissueSlots: tissueSlotsForLife(species, ageClass),
    populationDelta: { species, adultLivingDelta: ageClass === "adult" ? -1 : 0, cause: "wildlife_death" }, revision: 0,
  };
  const empty = createEmptyLifeCorpseLedger();
  const ledger: SessionLifeCorpseLedger = { ...empty, revision: 1, lives: { [lifeInstanceId]: life },
    corpses: { [corpseId]: corpse }, corpseIdByLifeId: { [lifeInstanceId]: corpseId } };
  return { lifeCorpseLedger: ledger, economy: createEmptySessionEconomy() };
};

const tx = (kind: string, key: string): string => createWildlifeProcessingTransactionId(kind, key);
const harvestAction = (aggregate: WildlifeProcessingAggregate, slot = "meat", key = `harvest.${slot}`): HarvestAction => {
  const corpse = Object.values(aggregate.lifeCorpseLedger.corpses)[0]!;
  const tissue = corpse.tissueSlots.find((candidate) => candidate.tissueSlotId === slot);
  return { action: "harvest", transactionId: tx("harvest", key), canonicalIdempotencyKey: key, currentWorldTick: 0,
    corpseId: corpse.corpseId, tissueSlotId: slot, harvestSequence: 0, expectedCorpseRevision: corpse.revision,
    expectedRemainingTissueQuantity: tissue?.remainingQuantity ?? 0, expectedInventoryRevision: aggregate.economy.inventoryRevision,
    playerSaveId: player, stationOrToolId: "field_knife" };
};
const mustCommit = (aggregate: WildlifeProcessingAggregate, action: WildlifeProcessingAction,
  context?: WildlifeProcessingApplyContext): WildlifeProcessingAggregate => {
  const effective = context ?? { currentLastEventSequence: action.action === "reserve" ? action.startEventSequence : 0, currentWorldTick: action.currentWorldTick, eligibleWorldEvents: [], energyReceipts: [] };
  const result = applyWildlifeProcessingAction(aggregate, action, effective);
  expect(result).toMatchObject({ committed: true, duplicate: false });
  if (!result.committed) throw new Error(result.reason);
  return result.aggregate;
};
const provenance = (lot: TradeLot): WildlifeLotProvenance =>
  (lot as TradeLot & { wildlifeProvenance: WildlifeLotProvenance }).wildlifeProvenance;
const naturalSalt = (lotId = "lot.salt.natural"): TradeLot => ({
  lotId, itemId: "material.salt", sourceLotIds: ["world.salt.deposit"], legalOwnerId: player, stolenFromId: null,
  processingTransactionId: "gather.salt", quantity: 2, originKind: "natural", naturalFraction: 1, freshness: "stable",
  qualityMultiplier: 1, contaminationMu: 0, economyEligible: true, reserved: false, equipped: false,
  ownershipRevision: 0, freshnessRevision: 0,
  wildlifeProvenance: { lifeInstanceId: null, deathEventId: null, harvestEventId: null, parentLotIds: ["world.salt.deposit"],
    transformEventId: "gather.salt", matterOrigin: "natural", freshnessCreatedTick: 0, preservationProfileId: null,
    lastDecayEvalTick: 0, remainingFreshnessSeconds: null, reservationRevision: 0, reservedByWorkOrderId: null },
} as TradeLot);
const addLot = (aggregate: WildlifeProcessingAggregate, lot: TradeLot): WildlifeProcessingAggregate => ({ ...aggregate,
  economy: { ...aggregate.economy, inventoryRevision: aggregate.economy.inventoryRevision + 1,
    lots: [...aggregate.economy.lots, lot] } });
const reserve = (aggregate: WildlifeProcessingAggregate, recipeId: string, lotIds: readonly string[], key = `reserve.${recipeId}`): WildlifeProcessingAggregate => {
  const inputs = lotIds.map((lotId) => {
    const lot = aggregate.economy.lots.find((candidate) => candidate.lotId === lotId)!;
    return { lotId, quantity: 1, expectedOwnershipRevision: lot.ownershipRevision,
      expectedFreshnessRevision: lot.freshnessRevision, expectedReservationRevision: provenance(lot).reservationRevision };
  });
  return mustCommit(aggregate, { action: "reserve", transactionId: tx("workorder_start", key), canonicalIdempotencyKey: key,
    currentWorldTick: aggregate.economy.activeWorldTick ?? 0, expectedInventoryRevision: aggregate.economy.inventoryRevision,
    playerSaveId: player, stationId: recipeId.startsWith("dry.") ? "drying_rack" : recipeId.startsWith("tan.") ? "settlement_tannery" : "communal_kitchen", recipeId, startEventSequence: 10, inputs });
};
const onlyOrder = (economy: SessionEconomyState): WildlifeProcessingWorkOrder => economy.workOrders[0] as unknown as WildlifeProcessingWorkOrder;

describe("wildlife harvest and processing runtime", () => {
  it("uses the authoritative WAL transaction/output/receipt fixed vectors", () => {
    const key = "event.1";
    const transactionId = createCrossSaveTransactionId("harvest", key);
    expect(createWildlifeProcessingTransactionId("harvest", key)).toBe(transactionId);
    expect(transactionId).toBe("wal-tx:sha256:463458bd7034842662b2b93b2fda5bf531898a34ac125871cdeee35dd22ee9cd");
    const aggregate = corpseAggregate("rabbit");
    const harvested = applyWildlifeProcessingAction(aggregate, {
      ...harvestAction(aggregate), transactionId, canonicalIdempotencyKey: key,
    });
    expect(harvested).toMatchObject({ committed: true });
    if (!harvested.committed) throw new Error(harvested.reason);
    expect(harvested.aggregate.economy.lots[0]?.lotId).toBe(createCrossSaveOutputId(transactionId, "inventory_lot", 0));
    expect(harvested.receipt.receiptId).toBe(createCrossSaveReceiptId(transactionId, "harvest"));
  });
  it("harvests each adult rabbit tissue slot once with deterministic IDs and complete provenance", () => {
    let state = corpseAggregate("rabbit");
    const action = harvestAction(state); const staleRetry = { ...action, transactionId: tx("harvest", "harvest.meat.retry"), canonicalIdempotencyKey: "harvest.meat.retry" };
    const first = applyWildlifeProcessingAction(state, action);
    expect(first).toMatchObject({ committed: true, receipt: { action: "harvest", zeroYieldReason: null } });
    if (!first.committed) throw new Error(first.reason);
    state = first.aggregate;
    const lot = state.economy.lots[0]!;
    expect(lot).toMatchObject({ itemId: "food.raw_small_game_meat", quantity: 2, legalOwnerId: player,
      originKind: "natural", naturalFraction: 1, economyEligible: true, freshness: "fresh" });
    expect(lot.lotId).toMatch(/^wal-output:sha256:[0-9a-f]{64}$/);
    expect(provenance(lot)).toMatchObject({ lifeInstanceId: Object.keys(state.lifeCorpseLedger.lives)[0],
      deathEventId: Object.values(state.lifeCorpseLedger.corpses)[0]?.deathEventId, harvestEventId: action.transactionId,
      matterOrigin: "natural", freshnessCreatedTick: 0, reservationRevision: 0, reservedByWorkOrderId: null });
    const duplicate = applyWildlifeProcessingAction(state, action);
    expect(duplicate).toMatchObject({ committed: false, duplicate: true });
    expect(duplicate.aggregate).toEqual(state);
    expect(applyWildlifeProcessingAction(state, staleRetry)).toMatchObject({ committed: false, reason: "revision_conflict" });
  });

  it("records juvenile and quality-floor zero outputs without minting lots", () => {
    const juvenile = corpseAggregate("rabbit", "juvenile");
    const zero = applyWildlifeProcessingAction(juvenile, harvestAction(juvenile));
    expect(zero).toMatchObject({ committed: false, reason: "invalid_action" });
    expect(zero.aggregate.economy.lots).toHaveLength(0);

    const crushed = corpseAggregate("rabbit", "adult", "no_tool");
    const hide = applyWildlifeProcessingAction(crushed, harvestAction(crushed, "hide"));
    expect(hide).toMatchObject({ committed: true, receipt: { outputLotIds: [], zeroYieldReason: "quality_floor_zero" } });
  });

  it("uses machine yields for adult fox and floors each output independently", () => {
    let state = corpseAggregate("fox", "adult", "fire_or_explosion");
    const meat = applyWildlifeProcessingAction(state, harvestAction(state, "meat", "fox.meat"));
    expect(meat).toMatchObject({ committed: true, receipt: { zeroYieldReason: "quality_floor_zero" } });
    if (!meat.committed) throw new Error(meat.reason);
    state = meat.aggregate;
    const hide = applyWildlifeProcessingAction(state, harvestAction(state, "hide", "fox.hide"));
    expect(hide).toMatchObject({ committed: true, receipt: { zeroYieldReason: "quality_floor_zero" } });
    expect(wildlifeProcessingManifest().harvestProfiles["harvest.fox.v0.1"]?.adultFullYield).toHaveLength(2);
  });

  it("runs cook reserved→completed→claimed and preserves origin/freshness history", () => {
    let state = corpseAggregate("rabbit");


    state = mustCommit(state, harvestAction(state));
    const raw = state.economy.lots[0]!;
    state = reserve(state, "cook.game_meat.v0.1", [raw.lotId]);
    const order = onlyOrder(state.economy);
    expect(order).toMatchObject({ status: "reserved", requiredEventCount: 0 });
    expect(state.economy.lots[0]).toMatchObject({ reserved: true });
    const completeKey = "cook.complete";
    const complete = { action: "complete" as const, transactionId: tx("workorder_complete", completeKey), canonicalIdempotencyKey: completeKey,
      currentWorldTick: order.readyWorldTick, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: "energy.heat.1" };
    expect(applyWildlifeProcessingAction(state, { ...complete, energyEventId: null }, {
      currentLastEventSequence: 11, currentWorldTick: complete.currentWorldTick, eligibleWorldEvents: [], energyReceipts: [],
    })).toMatchObject({ committed: false, reason: "feature_unavailable" });
    state = mustCommit(state, complete, { currentLastEventSequence: 11, currentWorldTick: complete.currentWorldTick, eligibleWorldEvents: [], energyReceipts: [
      { eventId: "energy.heat.1", kind: "heat_work", eu: 8, sequence: 11, workOrderId: order.workOrderId },
    ] });
    const completed = onlyOrder(state.economy);
    const cooked = state.economy.lots.find((lot) => completed.outputLotIds.includes(lot.lotId))!;
    expect(completed.status).toBe("completed");
    expect(cooked).toMatchObject({ itemId: "food.cooked_game_meat", legalOwnerId: `station:${order.stationId}`,
      originKind: "natural", naturalFraction: 1, economyEligible: true });
    expect(provenance(cooked)).toMatchObject({ matterOrigin: "natural", parentLotIds: [raw.lotId],
      freshnessCreatedTick: provenance(raw).freshnessCreatedTick, transformEventId: tx("workorder_complete", completeKey) });
    const claimKey = "cook.claim";
    state = mustCommit(state, { action: "claim", transactionId: tx("workorder_claim", claimKey), canonicalIdempotencyKey: claimKey,
      currentWorldTick: state.economy.activeWorldTick ?? 0, workOrderId: completed.workOrderId,
      expectedWorkOrderRevision: completed.revision, expectedInventoryRevision: state.economy.inventoryRevision,
      claimantPlayerSaveId: player });
    expect(onlyOrder(state.economy).status).toBe("claimed");
    expect(state.economy.lots.find((lot) => lot.lotId === cooked.lotId)?.legalOwnerId).toBe(player);
    expect(isSessionEconomyState(state.economy)).toBe(true);
  });

  it("rejects field dress through the generic workorder path, arbitrary stations, and clock jumps", () => {
    let state = corpseAggregate("rabbit"); state = mustCommit(state, harvestAction(state)); const raw = state.economy.lots[0]!;
    const build = (recipeId: string, stationId: string, key: string, currentWorldTick = 0) => ({ action: "reserve" as const,
      transactionId: tx("workorder_start", key), canonicalIdempotencyKey: key, currentWorldTick,
      expectedInventoryRevision: state.economy.inventoryRevision, playerSaveId: player, stationId, recipeId, startEventSequence: 10,
      inputs: [{ lotId: raw.lotId, quantity: 1, expectedOwnershipRevision: raw.ownershipRevision,
        expectedFreshnessRevision: raw.freshnessRevision, expectedReservationRevision: provenance(raw).reservationRevision }] });
    expect(applyWildlifeProcessingAction(state, build("process.field_dress.v0.1", "field_knife", "field.dress"), { currentLastEventSequence: 10, currentWorldTick: 0, eligibleWorldEvents: [], energyReceipts: [] })).toMatchObject({ committed: false, reason: "invalid_action" });
    expect(applyWildlifeProcessingAction(state, build("cook.game_meat.v0.1", "forged_station", "bad.station"), { currentLastEventSequence: 10, currentWorldTick: 0, eligibleWorldEvents: [], energyReceipts: [] })).toMatchObject({ committed: false, reason: "invalid_action" });
    expect(applyWildlifeProcessingAction(state, build("cook.game_meat.v0.1", "communal_kitchen", "clock.jump", 99), { currentLastEventSequence: 10, currentWorldTick: 99, eligibleWorldEvents: [], energyReceipts: [] })).toMatchObject({ committed: false, reason: "revision_conflict" });
  });

  it("requires distinct authoritative classified events for drying and never counts duplicate IDs", () => {
    let state = corpseAggregate("rabbit"); state = mustCommit(state, harvestAction(state)); state = addLot(state, naturalSalt());
    const meat = state.economy.lots.find((lot) => lot.itemId.includes("raw_small"))!;
    const salt = state.economy.lots.find((lot) => lot.itemId === "material.salt")!;
    state = reserve(state, "dry.game_meat.v0.1", [meat.lotId, salt.lotId]);
    const order = onlyOrder(state.economy);
    const key = "dry.complete";
    const complete = { action: "complete" as const, transactionId: tx("workorder_complete", key), canonicalIdempotencyKey: key,
      currentWorldTick: Math.max(order.readyWorldTick, state.economy.activeWorldTick ?? 0), workOrderId: order.workOrderId,
      expectedWorkOrderRevision: order.revision, expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: null };
    const duplicateContext: WildlifeProcessingApplyContext = { currentLastEventSequence: 12, currentWorldTick: complete.currentWorldTick, energyReceipts: [], eligibleWorldEvents: [
      { eventId: "world.event.1", classification: "region_transition_commit", sequence: 11 },
      { eventId: "world.event.1", classification: "region_transition_commit", sequence: 12 },
    ] };
    expect(applyWildlifeProcessingAction(state, complete, duplicateContext)).toMatchObject({ committed: false, reason: "not_ready" });
    state = mustCommit(state, complete, { ...duplicateContext, eligibleWorldEvents: [duplicateContext.eligibleWorldEvents[0]!,
      { eventId: "world.event.2", classification: "mainline_world_predicate_commit", sequence: 12 }] });
    expect(onlyOrder(state.economy).status).toBe("completed");
    expect(onlyOrder(state.economy).processedEventIds).toEqual(["world.event.1", "world.event.2"]);
  });

  it("lazy-decays reserved inputs, fails spoiled work atomically, then permits cancellation", () => {
    let state = corpseAggregate("rabbit"); state = mustCommit(state, harvestAction(state));
    state = reserve(state, "cook.game_meat.v0.1", [state.economy.lots[0]!.lotId]);
    let order = onlyOrder(state.economy); const completeKey = "spoiled.complete";
    state = mustCommit(state, { action: "complete", transactionId: tx("workorder_complete", completeKey), canonicalIdempotencyKey: completeKey,
      currentWorldTick: 24 * 3600 + 1, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: "energy.spoiled" }, {
      currentLastEventSequence: 11, currentWorldTick: 24 * 3600 + 1, eligibleWorldEvents: [], energyReceipts: [{ eventId: "energy.spoiled", kind: "heat_work", eu: 8, sequence: 11, workOrderId: order.workOrderId }],
    });
    order = onlyOrder(state.economy);
    expect(order).toMatchObject({ status: "failed_spoiled", outputLotIds: [], failureReason: "input_spoiled_after_lazy_decay" });
    expect(state.economy.processingReceipts.at(-1)).toMatchObject({ transactionKind: "workorder_complete", zeroYieldReason: "failed_spoiled" });
    expect(state.economy.lots[0]).toMatchObject({ quantity: 2, reserved: true, freshness: "decomposed" });
    const cancelKey = "spoiled.cancel";
    state = mustCommit(state, { action: "cancel", transactionId: tx("workorder_cancel", cancelKey), canonicalIdempotencyKey: cancelKey,
      currentWorldTick: state.economy.activeWorldTick ?? 0, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision });
    expect(onlyOrder(state.economy).status).toBe("cancelled");
    expect(state.economy.lots[0]?.reserved).toBe(false);
  });

  it("does not launder manifested or legacy-unknown matter through processing", () => {
    let state = corpseAggregate("rabbit");
    const natural = naturalSalt("lot.manifested.raw") as TradeLot & { wildlifeProvenance: WildlifeLotProvenance };
    const manifested: TradeLot = { ...natural, itemId: "food.raw_small_game_meat", originKind: "manifested", naturalFraction: 0,
      economyEligible: false, wildlifeProvenance: { ...natural.wildlifeProvenance, matterOrigin: "manifested" } } as TradeLot;
    state = addLot(state, manifested);
    state = reserve(state, "cook.game_meat.v0.1", [manifested.lotId]);
    const order = onlyOrder(state.economy); const key = "manifested.complete";
    state = mustCommit(state, { action: "complete", transactionId: tx("workorder_complete", key), canonicalIdempotencyKey: key,
      currentWorldTick: order.readyWorldTick, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: "energy.manifested" }, {
      currentLastEventSequence: 11, currentWorldTick: order.readyWorldTick, eligibleWorldEvents: [], energyReceipts: [{ eventId: "energy.manifested", kind: "heat_work", eu: 8, sequence: 11, workOrderId: order.workOrderId }],
    });
    const output = state.economy.lots.find((lot) => onlyOrder(state.economy).outputLotIds.includes(lot.lotId))!;
    expect(output).toMatchObject({ originKind: "manifested", naturalFraction: 0, economyEligible: false });
    expect(provenance(output).matterOrigin).toBe("manifested");
  });

  it("rejects same transaction with different payload and preserves state across clone/save-shaped roundtrip", () => {
    const initial = corpseAggregate("rabbit"); const action = harvestAction(initial);
    const result = applyWildlifeProcessingAction(initial, action); if (!result.committed) throw new Error(result.reason);
    const conflict = applyWildlifeProcessingAction(result.aggregate, { ...action, playerSaveId: "player.other" });
    expect(conflict).toMatchObject({ committed: false, duplicate: false, reason: "transaction_payload_conflict" });
    const roundtrip = structuredClone(result.aggregate);
    expect(roundtrip).toEqual(result.aggregate);
    expect(isSessionEconomyState(roundtrip.economy)).toBe(true);
    expect(roundtrip.lifeCorpseLedger.corpses[action.corpseId]?.tissueSlots.find((slot) => slot.tissueSlotId === "meat")?.remainingQuantity).toBe(0);
  });
  it("fails closed for missing provenance and binds claim authority to the initiating player", () => {
    let missing = corpseAggregate("rabbit"); missing = mustCommit(missing, harvestAction(missing));
    const raw = missing.economy.lots[0]!;
    const stripped = { ...raw } as TradeLot & { wildlifeProvenance?: WildlifeLotProvenance };
    delete stripped.wildlifeProvenance;
    missing = { ...missing, economy: { ...missing.economy, lots: [stripped] } };
    const key = "missing.provenance.reserve";
    const action = { action: "reserve" as const, transactionId: tx("workorder_start", key), canonicalIdempotencyKey: key,
      currentWorldTick: 0, expectedInventoryRevision: missing.economy.inventoryRevision, playerSaveId: player,
      stationId: "communal_kitchen", recipeId: "cook.game_meat.v0.1", startEventSequence: 10,
      inputs: [{ lotId: stripped.lotId, quantity: 1, expectedOwnershipRevision: stripped.ownershipRevision,
        expectedFreshnessRevision: stripped.freshnessRevision, expectedReservationRevision: 0 }] };
    expect(applyWildlifeProcessingAction(missing, action, { currentLastEventSequence: 10, currentWorldTick: 0,
      eligibleWorldEvents: [], energyReceipts: [] })).toMatchObject({ committed: false, reason: "ineligible_input" });

    let state = corpseAggregate("rabbit"); state = mustCommit(state, harvestAction(state));
    state = reserve(state, "cook.game_meat.v0.1", [state.economy.lots[0]!.lotId], "owner.reserve");
    let order = onlyOrder(state.economy); const completeKey = "owner.complete";
    const complete = { action: "complete" as const, transactionId: tx("workorder_complete", completeKey), canonicalIdempotencyKey: completeKey,
      currentWorldTick: order.readyWorldTick, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: "energy.owner" };
    state = mustCommit(state, complete, { currentLastEventSequence: 11, currentWorldTick: complete.currentWorldTick,
      eligibleWorldEvents: [], energyReceipts: [{ eventId: "energy.owner", kind: "heat_work", eu: 8, sequence: 11, workOrderId: order.workOrderId }] });
    order = onlyOrder(state.economy); const claimKey = "foreign.claim";
    expect(applyWildlifeProcessingAction(state, { action: "claim", transactionId: tx("workorder_claim", claimKey), canonicalIdempotencyKey: claimKey,
      currentWorldTick: state.economy.activeWorldTick ?? 0, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
      expectedInventoryRevision: state.economy.inventoryRevision, claimantPlayerSaveId: "player.foreign" },
      { currentLastEventSequence: 12, currentWorldTick: state.economy.activeWorldTick ?? 0, eligibleWorldEvents: [], energyReceipts: [] }))
      .toMatchObject({ committed: false, reason: "state_conflict" });
  });

  it("binds energy proof to one workorder and preserves remaining freshness severity at five and seven hours", () => {
    const run = (ageSeconds: number, suffix: string) => {
      let state = corpseAggregate("rabbit"); state = mustCommit(state, harvestAction(state, "meat", `age.harvest.${suffix}`));
      state = { ...state, economy: { ...state.economy, activeWorldTick: ageSeconds } };
      state = reserve(state, "cook.game_meat.v0.1", [state.economy.lots[0]!.lotId], `age.reserve.${suffix}`);
      const order = onlyOrder(state.economy); const completeKey = `age.complete.${suffix}`;
      const complete = { action: "complete" as const, transactionId: tx("workorder_complete", completeKey), canonicalIdempotencyKey: completeKey,
        currentWorldTick: order.readyWorldTick, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
        expectedInventoryRevision: state.economy.inventoryRevision, energyEventId: `energy.${suffix}` };
      const wrong = applyWildlifeProcessingAction(state, complete, { currentLastEventSequence: 11, currentWorldTick: complete.currentWorldTick,
        eligibleWorldEvents: [], energyReceipts: [{ eventId: `energy.${suffix}`, kind: "heat_work", eu: 8, sequence: 11, workOrderId: "workorder.other" }] });
      expect(wrong).toMatchObject({ committed: false, reason: "ineligible_input" });
      state = mustCommit(state, complete, { currentLastEventSequence: 11, currentWorldTick: complete.currentWorldTick,
        eligibleWorldEvents: [], energyReceipts: [{ eventId: `energy.${suffix}`, kind: "heat_work", eu: 8, sequence: 11, workOrderId: order.workOrderId }] });
      const output = state.economy.lots.find((lot) => onlyOrder(state.economy).outputLotIds.includes(lot.lotId))!;
      return { output, source: state.economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")! };
    };
    const five = run(5 * 3600, "five");
    expect(provenance(five.output).remainingFreshnessSeconds).toBeLessThanOrEqual(provenance(five.source).remainingFreshnessSeconds ?? Number.POSITIVE_INFINITY);
    const seven = run(7 * 3600, "seven");
    expect(seven.output.freshness).toBe("aging");
    expect(provenance(seven.output).freshnessCreatedTick).toBe(0);
    const sameTick = decayWildlifeLotToTick(seven.output, provenance(seven.output).lastDecayEvalTick);
    expect(sameTick.freshness).toBe("aging");
    const spoiledAfterBudget = decayWildlifeLotToTick(seven.output, provenance(seven.output).lastDecayEvalTick + 5 * 3600);
    expect(spoiledAfterBudget.freshness).toBe("spoiled");
    expect(decayWildlifeLotToTick(spoiledAfterBudget, provenance(spoiledAfterBudget).lastDecayEvalTick).freshness).toBe("spoiled");
  });
});
