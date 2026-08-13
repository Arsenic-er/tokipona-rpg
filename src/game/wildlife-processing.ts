import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeWildlifeProcessingManifest,
  type RuntimeFreshnessState,
  type RuntimeProcessingRecipe,
  type RuntimeWildlifeProcessingManifest,
} from "../content/runtime-wildlife-processing-manifest";
import type { SessionEconomyState } from "./economy-state";
import type { SessionLifeCorpseLedger, SessionWildlifeCorpseRecord } from "./life-corpse-ledger";
import type { TradeFreshness, TradeLot, TradeOrigin } from "./trade";
import {
  createCrossSaveOutputId,
  createCrossSaveReceiptId,
  createCrossSaveTransactionId,
  sha256Canonical,
  type JsonValue,
} from "../persistence/cross-save-wal";

export type WildlifeProcessingActionKind = "harvest" | "reserve" | "complete" | "claim" | "cancel";
export type WildlifeWorkOrderStatus = "reserved" | "completed" | "failed_spoiled" | "claimed" | "cancelled";
export type WildlifeMatterOrigin = "natural" | "manifested" | "mixed" | "legacy_unknown";

export interface WildlifeLotProvenance {
  readonly lifeInstanceId: string | null;
  readonly deathEventId: string | null;
  readonly harvestEventId: string | null;
  readonly parentLotIds: readonly string[];
  readonly transformEventId: string | null;
  readonly matterOrigin: WildlifeMatterOrigin;
  readonly freshnessCreatedTick: number;
  readonly preservationProfileId: string | null;
  readonly lastDecayEvalTick: number;
  readonly remainingFreshnessSeconds: number | null;
  readonly reservationRevision: number;
  readonly reservedByWorkOrderId: string | null;
}

export type WildlifeTradeLot = TradeLot & { readonly wildlifeProvenance: WildlifeLotProvenance };

export interface WildlifeWorkOrderInput {
  readonly lotId: string;
  readonly quantity: number;
  readonly startOwnershipRevision: number;
  readonly startFreshnessRevision: number;
  readonly startReservationRevision: number;
}

export interface WildlifeProcessingWorkOrder {
  readonly workOrderId: string;
  readonly recipeId: string;
  readonly recipeVersion: string;
  readonly stationId: string;
  readonly initiatingPlayerSaveId: string;
  readonly status: WildlifeWorkOrderStatus;
  readonly inputs: readonly WildlifeWorkOrderInput[];
  readonly inputLotIds: readonly string[];
  readonly startEventSequence: number;
  readonly requiredEventCount: number;
  readonly eligibleEventFilter: readonly string[];
  readonly processedThroughSequence: number;
  readonly processedEventIds: readonly string[];
  readonly stationStorageProfile: string;
  readonly startWorldTick: number;
  readonly readyWorldTick: number;
  readonly outputLotIds: readonly string[];
  readonly failureReason: string | null;
  readonly revision: number;
}

export interface WildlifeProcessingReceipt {
  readonly receiptId: string;
  readonly transactionId: string;
  readonly transactionKind: string;
  readonly action: WildlifeProcessingActionKind;
  readonly payloadHash: string;
  readonly workOrderId: string | null;
  readonly corpseId: string | null;
  readonly tissueSlotId: string | null;
  readonly inputLotIds: readonly string[];
  readonly outputLotIds: readonly string[];
  readonly zeroYieldReason: string | null;
  readonly committedWorldTick: number;
}

interface ActionBase {
  readonly action: WildlifeProcessingActionKind;
  readonly transactionId: string;
  readonly canonicalIdempotencyKey: string;
  readonly currentWorldTick: number;
  /** Required at the Session production boundary; pure machine tests may omit it. */
  readonly interactionReceiptId?: string;
}

export interface HarvestAction extends ActionBase {
  readonly action: "harvest";
  readonly corpseId: string;
  readonly tissueSlotId: string;
  readonly harvestSequence: number;
  readonly expectedCorpseRevision: number;
  readonly expectedRemainingTissueQuantity: number;
  readonly expectedInventoryRevision: number;
  readonly playerSaveId: string;
  readonly stationOrToolId: string;
}

export interface WorkOrderInputCas {
  readonly lotId: string;
  readonly quantity: number;
  readonly expectedOwnershipRevision: number;
  readonly expectedFreshnessRevision: number;
  readonly expectedReservationRevision: number;
}

export interface ReserveWorkOrderAction extends ActionBase {
  readonly action: "reserve";
  readonly expectedInventoryRevision: number;
  readonly playerSaveId: string;
  readonly stationId: string;
  readonly recipeId: string;
  readonly startEventSequence: number;
  readonly inputs: readonly WorkOrderInputCas[];
}

export interface CompleteWorkOrderAction extends ActionBase {
  readonly action: "complete";
  readonly workOrderId: string;
  readonly expectedWorkOrderRevision: number;
  readonly expectedInventoryRevision: number;
  readonly energyEventId: string | null;
}

export interface ClaimWorkOrderAction extends ActionBase {
  readonly action: "claim";
  readonly workOrderId: string;
  readonly expectedWorkOrderRevision: number;
  readonly expectedInventoryRevision: number;
  readonly claimantPlayerSaveId: string;
}

export interface CancelWorkOrderAction extends ActionBase {
  readonly action: "cancel";
  readonly workOrderId: string;
  readonly expectedWorkOrderRevision: number;
  readonly expectedInventoryRevision: number;
}

export type WildlifeProcessingAction = HarvestAction | ReserveWorkOrderAction | CompleteWorkOrderAction |
  ClaimWorkOrderAction | CancelWorkOrderAction;

export interface WildlifeProcessingAggregate {
  readonly lifeCorpseLedger: SessionLifeCorpseLedger;
  readonly economy: SessionEconomyState;
}

export interface WildlifeProcessingApplyContext {
  readonly currentLastEventSequence: number;
  readonly currentWorldTick: number;
  readonly eligibleWorldEvents: readonly Readonly<{
    eventId: string;
    classification: "mainline_world_predicate_commit" | "non_replayed_side_task_commit" | "region_transition_commit";
    sequence: number;
  }>[];
  readonly energyReceipts: readonly Readonly<{ eventId: string; kind: string; eu: number; sequence: number; workOrderId: string }>[];
}

const EMPTY_CONTEXT: WildlifeProcessingApplyContext = Object.freeze({ currentLastEventSequence: 0, currentWorldTick: 0, eligibleWorldEvents: [], energyReceipts: [] });

export type WildlifeProcessingFailureReason = "invalid_action" | "transaction_payload_conflict" |
  "revision_conflict" | "not_found" | "state_conflict" | "ineligible_input" | "not_ready" | "feature_unavailable";

export type WildlifeProcessingApplyResult = Readonly<{
  committed: true;
  duplicate: false;
  aggregate: WildlifeProcessingAggregate;
  receipt: WildlifeProcessingReceipt;
}> | Readonly<{
  committed: false;
  duplicate: boolean;
  reason: WildlifeProcessingFailureReason;
  aggregate: WildlifeProcessingAggregate;
  receipt: WildlifeProcessingReceipt | null;
}>;

const manifest = readRuntimeWildlifeProcessingManifest(generatedRuntimeArtifact);
export const wildlifeProcessingManifest = (): RuntimeWildlifeProcessingManifest => manifest;

const clone = <T>(value: T): T => structuredClone(value);
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonical(source[key])]));
};

const actionKind = (action: WildlifeProcessingAction): string => action.action === "reserve" ? "workorder_start" :
  action.action === "complete" ? "workorder_complete" : action.action === "claim" ? "workorder_claim" : action.action === "cancel" ? "workorder_cancel" : "harvest";

/** Single authority: IDs and SHA-256 bytes come from the cross-save WAL runtime. */
export const createWildlifeProcessingTransactionId = (kind: string, canonicalIdempotencyKey: string): string =>
  createCrossSaveTransactionId(kind, canonicalIdempotencyKey);
const outputId = (transactionId: string, index: number): string => createCrossSaveOutputId(transactionId, "inventory_lot", index);
const receiptId = (transactionId: string, kind: string): string => createCrossSaveReceiptId(transactionId, kind);
const workOrderId = (transactionId: string): string => createCrossSaveOutputId(transactionId, "work_order", 0);
export const wildlifeProcessingPayloadHash = (action: WildlifeProcessingAction): string =>
  sha256Canonical(action as unknown as JsonValue);

export interface WildlifeProcessingWorkIdentity {
  readonly workOrderId: string;
  readonly expectedWorkOrderRevision: number;
  readonly stationInteractionId: string;
}

export const canonicalWildlifeProcessingWorkIdempotencyKey = (identity: WildlifeProcessingWorkIdentity): string =>
  JSON.stringify(canonical({ work_order_id: identity.workOrderId, work_order_revision: identity.expectedWorkOrderRevision,
    station_interaction_id: identity.stationInteractionId }));
export const createWildlifeProcessingWorkTransactionId = (identity: WildlifeProcessingWorkIdentity): string =>
  createCrossSaveTransactionId("workorder_work", canonicalWildlifeProcessingWorkIdempotencyKey(identity));
export const wildlifeProcessingWorkPayloadHash = (identity: WildlifeProcessingWorkIdentity, seconds: number): `sha256:${string}` =>
  sha256Canonical({ work_order_id: identity.workOrderId, work_order_revision: identity.expectedWorkOrderRevision,
    station_interaction_id: identity.stationInteractionId, active_world_seconds: seconds } as JsonValue);

export interface WildlifeProcessingCanonicalAuthority {
  readonly requiredEventCursor: number;
  readonly cancellationSequence: number;
}

/** Canonical material from the authored idempotency_key_fields contract. */
export const canonicalWildlifeProcessingIdempotencyKey = (
  action: WildlifeProcessingAction,
  authority: WildlifeProcessingCanonicalAuthority,
): string => {
  const fields = action.action === "harvest"
    ? { corpse_id: action.corpseId, tissue_slot_id: action.tissueSlotId, harvest_sequence: action.harvestSequence }
    : action.action === "reserve"
      ? {
          player_save_id: action.playerSaveId,
          station_id: action.stationId,
          recipe_version: manifest.processingRecipes[action.recipeId]?.recipeVersion ?? "",
          sorted_input_lot_ids: [...action.inputs.map((input) => input.lotId)].sort(),
          start_sequence: action.startEventSequence,
        }
      : action.action === "complete"
        ? { work_order_id: action.workOrderId, required_event_cursor: authority.requiredEventCursor }
        : action.action === "claim"
          ? { work_order_id: action.workOrderId, claimant_player_save_id: action.claimantPlayerSaveId }
          : { work_order_id: action.workOrderId, cancellation_sequence: authority.cancellationSequence };
  return JSON.stringify(canonical(fields));
};

export const wildlifeProcessingTransactionKind = (action: WildlifeProcessingAction): string => actionKind(action);
const activeTick = (economy: SessionEconomyState): number => {
  const value = (economy as SessionEconomyState & { readonly activeWorldTick?: number }).activeWorldTick;
  return count(value) ? value : 0;
};
const workOrders = (economy: SessionEconomyState): readonly WildlifeProcessingWorkOrder[] => economy.workOrders as unknown as readonly WildlifeProcessingWorkOrder[];
const receipts = (economy: SessionEconomyState): readonly WildlifeProcessingReceipt[] => economy.processingReceipts as unknown as readonly WildlifeProcessingReceipt[];
const provenance = (lot: TradeLot): WildlifeLotProvenance | null => {
  const candidate = (lot as TradeLot & { readonly wildlifeProvenance?: WildlifeLotProvenance }).wildlifeProvenance;
  return candidate ?? null;
};
const withProvenance = (lot: TradeLot, value: WildlifeLotProvenance): WildlifeTradeLot => ({ ...lot, sourceLotIds: [...lot.sourceLotIds], wildlifeProvenance: value });

const makeReceipt = (action: WildlifeProcessingAction, fields: Partial<WildlifeProcessingReceipt>): WildlifeProcessingReceipt => ({
  receiptId: receiptId(action.transactionId, fields.transactionKind ?? actionKind(action)), transactionId: action.transactionId,
  transactionKind: fields.transactionKind ?? actionKind(action), action: action.action, payloadHash: wildlifeProcessingPayloadHash(action),
  workOrderId: fields.workOrderId ?? null, corpseId: fields.corpseId ?? null, tissueSlotId: fields.tissueSlotId ?? null,
  inputLotIds: fields.inputLotIds ?? [], outputLotIds: fields.outputLotIds ?? [], zeroYieldReason: fields.zeroYieldReason ?? null,
  committedWorldTick: action.currentWorldTick,
});
const failure = (aggregate: WildlifeProcessingAggregate, reason: WildlifeProcessingFailureReason, duplicate = false, receipt: WildlifeProcessingReceipt | null = null): WildlifeProcessingApplyResult =>
  ({ committed: false, duplicate, reason, aggregate, receipt });
const committed = (aggregate: WildlifeProcessingAggregate, receipt: WildlifeProcessingReceipt): WildlifeProcessingApplyResult =>
  ({ committed: true, duplicate: false, aggregate, receipt });

const validateBase = (aggregate: WildlifeProcessingAggregate, action: WildlifeProcessingAction): WildlifeProcessingApplyResult | null => {
  if (!id(action.transactionId) || !id(action.canonicalIdempotencyKey) || !count(action.currentWorldTick) || action.currentWorldTick < activeTick(aggregate.economy) ||
      action.transactionId !== createWildlifeProcessingTransactionId(actionKind(action), action.canonicalIdempotencyKey)) return failure(aggregate, "invalid_action");
  const prior = receipts(aggregate.economy).find((entry) => entry.transactionId === action.transactionId);
  if (!prior) return null;
  return prior.payloadHash === wildlifeProcessingPayloadHash(action)
    ? failure(aggregate, "state_conflict", true, prior)
    : failure(aggregate, "transaction_payload_conflict");
};

const categoryFreshness = (itemId: string, tick: number, createdTick: number): TradeFreshness => {
  const profileId = manifest.items[itemId]?.preservationProfileId;
  if (!profileId) return "stable";
  const profile = manifest.decayProfiles[profileId];
  if (!profile) throw new Error(`missing decay profile ${profileId}`);
  const age = Math.max(0, tick - createdTick);
  return (profile.thresholdsSeconds.find((stage) => stage.untilSeconds === null || age < stage.untilSeconds)?.state ?? "decomposed") as TradeFreshness;
};
const remainingFreshnessBudget = (itemId: string, tick: number, createdTick: number): number | null => {
  const profileId = manifest.items[itemId]?.preservationProfileId;
  if (!profileId) return null;
  const profile = manifest.decayProfiles[profileId];
  if (!profile || profile.stable) return null;
  const spoiledIndex = profile.thresholdsSeconds.findIndex((stage) => stage.state === "spoiled" || stage.state === "rotten" || stage.state === "decomposed");
  const spoilBoundary = spoiledIndex <= 0 ? null : profile.thresholdsSeconds[spoiledIndex - 1]?.untilSeconds ?? null;
  return spoilBoundary === null ? null : Math.max(0, spoilBoundary - Math.max(0, tick - createdTick));
};
const freshnessRank: readonly TradeFreshness[] = ["stable", "cured", "fresh", "raw", "aging", "near_spoil", "slipping", "spoiled", "rotten", "decomposed"];
export const decayWildlifeLotToTick = (lot: TradeLot, tick: number): WildlifeTradeLot => {
  const source = provenance(lot);
  if (!source) throw new Error("processing input lacks complete provenance");
  const computed = categoryFreshness(lot.itemId, tick, source.freshnessCreatedTick);
  if (tick < source.lastDecayEvalTick) throw new Error("wildlife decay tick cannot regress");
  const elapsed = tick - source.lastDecayEvalTick;
  const nextBudget = source.remainingFreshnessSeconds === null ? null : Math.max(0, source.remainingFreshnessSeconds - elapsed);
  const budgetFreshness: TradeFreshness = nextBudget === 0 ? "spoiled" : computed;
  const nextFreshness = [lot.freshness, computed, budgetFreshness].reduce((worst, candidate) =>
    freshnessRank.indexOf(candidate) > freshnessRank.indexOf(worst) ? candidate : worst, lot.freshness);
  return withProvenance({ ...lot, freshness: nextFreshness,
    freshnessRevision: lot.freshnessRevision + (nextFreshness === lot.freshness ? 0 : 1) }, { ...source, lastDecayEvalTick: tick,
      remainingFreshnessSeconds: nextBudget });
};
const corpseDecay = (corpse: SessionWildlifeCorpseRecord, tick: number): SessionWildlifeCorpseRecord => ({
  ...corpse,
  decayState: categoryFreshness("food.raw_small_game_meat", tick, corpse.deathTick) as SessionWildlifeCorpseRecord["decayState"],
  lastDecayEvalTick: tick,
});

const replaceEconomy = (economy: SessionEconomyState, changes: Record<string, unknown>): SessionEconomyState => ({
  ...economy, ...changes,
  activeWorldTick: changes.activeWorldTick ?? activeTick(economy),
} as SessionEconomyState);

const appendReceipt = (economy: SessionEconomyState, receipt: WildlifeProcessingReceipt): readonly unknown[] => [...economy.processingReceipts, receipt];

const applyHarvest = (aggregate: WildlifeProcessingAggregate, action: HarvestAction): WildlifeProcessingApplyResult => {
  const corpse = aggregate.lifeCorpseLedger.corpses[action.corpseId];
  if (!corpse) return failure(aggregate, "not_found");
  if (corpse.revision !== action.expectedCorpseRevision || aggregate.economy.inventoryRevision !== action.expectedInventoryRevision) return failure(aggregate, "revision_conflict");
  const fieldDress = manifest.processingRecipes["process.field_dress.v0.1"];
  if (!id(action.tissueSlotId) || !id(action.playerSaveId) || !id(action.stationOrToolId) ||
      !fieldDress || !fieldDress.stationOrToolAny.includes(action.stationOrToolId) ||
      !count(action.harvestSequence) || !count(action.expectedRemainingTissueQuantity)) return failure(aggregate, "invalid_action");
  if (corpse.ageClass === "juvenile") return failure(aggregate, "invalid_action");
  const audited = corpse as SessionWildlifeCorpseRecord & { readonly harvestedSlotIds?: readonly string[] };
  const slot = corpse.tissueSlots.find((candidate) => candidate.tissueSlotId === action.tissueSlotId);
  if (!slot || slot.remainingQuantity !== action.expectedRemainingTissueQuantity) return failure(aggregate, slot ? "revision_conflict" : "not_found");
  if (audited.harvestedSlotIds?.includes(action.tissueSlotId) || slot?.remainingQuantity === 0) return failure(aggregate, "state_conflict");
  const profile = manifest.harvestProfiles[corpse.harvestProfileId];
  if (!profile || profile.species !== corpse.species) return failure(aggregate, "invalid_action");
  const profileSlot = profile.adultFullYield.find((candidate) => candidate.tissueSlotId === action.tissueSlotId);
  if (!profileSlot || !slot || profileSlot.itemId !== slot.itemId || profileSlot.quantity !== slot.originalQuantity) return failure(aggregate, "invalid_action");
  const quality = manifest.damageQuality[corpse.causeClass] ?? manifest.damageQuality.other_physical;
  if (!quality) return failure(aggregate, "invalid_action");
  const multiplier = action.tissueSlotId === "hide" ? quality.hideQualityMultiplier : quality.meatYieldMultiplier;
  const quantity = Math.floor(slot.originalQuantity * multiplier);
  const nextCorpse = corpseDecay({ ...corpse, revision: corpse.revision + 1,
    tissueSlots: corpse.tissueSlots.map((candidate) => candidate.tissueSlotId === action.tissueSlotId
      ? { ...candidate, remainingQuantity: 0, revision: candidate.revision + 1 } : candidate),
    harvestedSlotIds: [...(audited.harvestedSlotIds ?? []), action.tissueSlotId],
  } as SessionWildlifeCorpseRecord, action.currentWorldTick);
  const outputLotIds = quantity === 0 ? [] : [outputId(action.transactionId, 0)];
  const receipt = makeReceipt(action, { corpseId: corpse.corpseId, tissueSlotId: action.tissueSlotId, outputLotIds,
    zeroYieldReason: quantity === 0 ? "quality_floor_zero" : null });
  const nextLots = [...aggregate.economy.lots];
  if (quantity > 0 && slot) {
    const item = manifest.items[slot.itemId]!;
    const freshness = categoryFreshness(slot.itemId, action.currentWorldTick, corpse.deathTick);
    const lot: WildlifeTradeLot = {
      lotId: outputLotIds[0]!, itemId: slot.itemId, sourceLotIds: [corpse.corpseId], legalOwnerId: action.playerSaveId,
      stolenFromId: null, processingTransactionId: action.transactionId, quantity, originKind: "natural", naturalFraction: 1,
      freshness, qualityMultiplier: Math.max(0.25, multiplier), contaminationMu: corpse.contaminationMu,
      economyEligible: true, reserved: false, equipped: false, ownershipRevision: 0, freshnessRevision: 0,
      wildlifeProvenance: { lifeInstanceId: corpse.lifeInstanceId, deathEventId: corpse.deathEventId, harvestEventId: action.transactionId,
        parentLotIds: [corpse.corpseId], transformEventId: null, matterOrigin: "natural", freshnessCreatedTick: corpse.deathTick,
        preservationProfileId: item.preservationProfileId, lastDecayEvalTick: action.currentWorldTick,
        remainingFreshnessSeconds: remainingFreshnessBudget(slot.itemId, action.currentWorldTick, corpse.deathTick), reservationRevision: 0, reservedByWorkOrderId: null },
    };
    nextLots.push(lot);
  }
  return committed({
    lifeCorpseLedger: { ...aggregate.lifeCorpseLedger, revision: aggregate.lifeCorpseLedger.revision + 1,
      corpses: { ...aggregate.lifeCorpseLedger.corpses, [corpse.corpseId]: nextCorpse } },
    economy: replaceEconomy(aggregate.economy, { activeWorldTick: action.currentWorldTick,
      inventoryRevision: aggregate.economy.inventoryRevision + 1, lots: nextLots,
      processingReceipts: appendReceipt(aggregate.economy, receipt) }),
  }, receipt);
};

const inputMatches = (lot: TradeLot, recipe: RuntimeProcessingRecipe, index: number): boolean => {
  const required = recipe.inputs[index]; if (!required) return false;
  return required.itemId !== null ? lot.itemId === required.itemId : manifest.items[lot.itemId]?.category === required.category;
};

const applyReserve = (aggregate: WildlifeProcessingAggregate, action: ReserveWorkOrderAction, context: WildlifeProcessingApplyContext): WildlifeProcessingApplyResult => {
  if (!id(action.playerSaveId) || !id(action.stationId) || !count(action.startEventSequence) || action.startEventSequence !== context.currentLastEventSequence ||
      action.currentWorldTick !== activeTick(aggregate.economy) ||
      aggregate.economy.inventoryRevision !== action.expectedInventoryRevision) return failure(aggregate, "revision_conflict");
  const recipe = manifest.processingRecipes[action.recipeId];
  if (!recipe || recipe.transactionKind === "harvest" || recipe.genericProcessOutputPathForbidden ||
      !recipe.stationOrToolAny.includes(action.stationId) || action.inputs.length !== recipe.inputs.length ||
      new Set(action.inputs.map((entry) => entry.lotId)).size !== action.inputs.length) return failure(aggregate, "invalid_action");
  const nextWorkOrderId = workOrderId(action.transactionId);
  if (workOrders(aggregate.economy).some((entry) => entry.workOrderId === nextWorkOrderId)) return failure(aggregate, "state_conflict");
  const selected = action.inputs.map((input) => aggregate.economy.lots.find((lot) => lot.lotId === input.lotId));
  for (let index = 0; index < action.inputs.length; index += 1) {
    const request = action.inputs[index]!, lot = selected[index];
    if (!lot) return failure(aggregate, "not_found");
    const source = provenance(lot);
    if (!source) return failure(aggregate, "ineligible_input");
    if (!inputMatches(lot, recipe, index) || request.quantity !== recipe.inputs[index]!.quantity || lot.quantity < request.quantity ||
        lot.legalOwnerId !== action.playerSaveId || lot.stolenFromId !== null || lot.reserved || lot.equipped ||
        lot.ownershipRevision !== request.expectedOwnershipRevision || lot.freshnessRevision !== request.expectedFreshnessRevision ||
        source.reservationRevision !== request.expectedReservationRevision || recipe.rejectInputStates.includes(lot.freshness as RuntimeFreshnessState)) return failure(aggregate, "ineligible_input");
  }
  const completionTick = action.currentWorldTick + recipe.interactionWorkUnits * manifest.workUnitActiveSeconds;
  const inputs: WildlifeWorkOrderInput[] = action.inputs.map((request) => ({ lotId: request.lotId, quantity: request.quantity,
    startOwnershipRevision: request.expectedOwnershipRevision, startFreshnessRevision: request.expectedFreshnessRevision,
    startReservationRevision: request.expectedReservationRevision }));
  const order: WildlifeProcessingWorkOrder = {
    workOrderId: nextWorkOrderId, recipeId: recipe.recipeId, recipeVersion: recipe.recipeVersion, stationId: action.stationId, initiatingPlayerSaveId: action.playerSaveId,
    status: "reserved", inputs, inputLotIds: inputs.map((entry) => entry.lotId), startEventSequence: action.startEventSequence,
    requiredEventCount: recipe.requiredDistinctEligibleEvents, eligibleEventFilter: [...recipe.eligibleEventFilter],
    processedThroughSequence: action.startEventSequence, processedEventIds: [], stationStorageProfile: recipe.stationStorageProfile,
    startWorldTick: action.currentWorldTick, readyWorldTick: completionTick, outputLotIds: [], failureReason: null, revision: 0,
  };
  const nextLots = aggregate.economy.lots.map((lot) => {
    if (!order.inputLotIds.includes(lot.lotId)) return lot;
    const source = provenance(lot);
    if (!source) throw new Error("reserved input lost provenance after preflight");
    return withProvenance({ ...lot, reserved: true }, { ...source, reservationRevision: source.reservationRevision + 1, reservedByWorkOrderId: order.workOrderId });
  });
  const receipt = makeReceipt(action, { workOrderId: order.workOrderId, inputLotIds: order.inputLotIds });
  return committed({ lifeCorpseLedger: aggregate.lifeCorpseLedger,
    economy: replaceEconomy(aggregate.economy, { activeWorldTick: activeTick(aggregate.economy), inventoryRevision: aggregate.economy.inventoryRevision + 1,
      lots: nextLots, workOrders: [...aggregate.economy.workOrders, order], processingReceipts: appendReceipt(aggregate.economy, receipt) }) }, receipt);
};

const orderById = (economy: SessionEconomyState, idValue: string): WildlifeProcessingWorkOrder | undefined => workOrders(economy).find((order) => order.workOrderId === idValue);
const replaceOrder = (economy: SessionEconomyState, order: WildlifeProcessingWorkOrder): readonly unknown[] => economy.workOrders.map((entry) => entry.workOrderId === order.workOrderId ? order : entry);

const worstFreshness = (lots: readonly TradeLot[]): TradeFreshness => {
  const rank: readonly TradeFreshness[] = ["stable", "cured", "fresh", "raw", "aging", "near_spoil", "slipping", "spoiled", "rotten", "decomposed"];
  return lots.reduce((worst, lot) => rank.indexOf(lot.freshness) > rank.indexOf(worst) ? lot.freshness : worst, "stable" as TradeFreshness);
};
const matterOrigin = (lots: readonly WildlifeTradeLot[]): WildlifeMatterOrigin => {
  const origins = new Set(lots.map((lot) => lot.wildlifeProvenance.matterOrigin));
  if (origins.has("legacy_unknown")) return "legacy_unknown";
  if (origins.size === 1) return [...origins][0]!;
  return "mixed";
};
const outputTradeOrigin = (origin: WildlifeMatterOrigin): TradeOrigin => origin === "natural" ? "natural" : origin === "legacy_unknown" ? "legacy_unknown" : "manifested";

const applyComplete = (aggregate: WildlifeProcessingAggregate, action: CompleteWorkOrderAction, context: WildlifeProcessingApplyContext): WildlifeProcessingApplyResult => {
  const order = orderById(aggregate.economy, action.workOrderId);
  if (!order) return failure(aggregate, "not_found");
  if (action.currentWorldTick !== context.currentWorldTick) return failure(aggregate, "invalid_action");
  if (order.revision !== action.expectedWorkOrderRevision || aggregate.economy.inventoryRevision !== action.expectedInventoryRevision) return failure(aggregate, "revision_conflict");
  if (order.status !== "reserved") return failure(aggregate, "state_conflict");
  const recipe = manifest.processingRecipes[order.recipeId];
  if (!recipe || recipe.recipeVersion !== order.recipeVersion) return failure(aggregate, "invalid_action");
  const eligible = context.eligibleWorldEvents.filter((entry) => entry.sequence > order.startEventSequence &&
    entry.sequence <= context.currentLastEventSequence && order.eligibleEventFilter.includes(entry.classification));
  const distinct = [...new Map(eligible.map((entry) => [entry.eventId, entry])).values()].sort((left, right) => left.sequence - right.sequence);
  if (action.currentWorldTick < order.readyWorldTick || distinct.length < order.requiredEventCount) return failure(aggregate, "not_ready");
  if (recipe.energyRequirement !== null) {
    if (!id(action.energyEventId)) return failure(aggregate, "feature_unavailable");
    const energy = context.energyReceipts.find((entry) => entry.eventId === action.energyEventId &&
      entry.sequence > order.startEventSequence && entry.sequence <= context.currentLastEventSequence);
    if (energy && energy.workOrderId !== order.workOrderId) return failure(aggregate, "ineligible_input");
    if (!energy || energy.kind !== recipe.energyRequirement.kind || energy.eu < recipe.energyRequirement.eu) return failure(aggregate, "ineligible_input");
  } else if (action.energyEventId !== null) return failure(aggregate, "invalid_action");
  const lockedOrder = order;
  const currentInputs = lockedOrder.inputs.map((input) => aggregate.economy.lots.find((lot) => lot.lotId === input.lotId));
  if (currentInputs.some((lot) => lot === undefined)) return failure(aggregate, "not_found");
  if ((currentInputs as WildlifeTradeLot[]).some((lot, index) => { const audit = order.inputs[index]!, source = provenance(lot); return !source ||
    !lot.reserved || source.reservedByWorkOrderId !== lockedOrder.workOrderId || lot.quantity < audit.quantity ||
    lot.ownershipRevision !== audit.startOwnershipRevision || lot.freshnessRevision !== audit.startFreshnessRevision ||
    source.reservationRevision !== audit.startReservationRevision + 1; })) return failure(aggregate, "revision_conflict");
  const decayed = aggregate.economy.lots.map((lot) => order.inputLotIds.includes(lot.lotId) ? decayWildlifeLotToTick(lot, action.currentWorldTick) : lot);
  const inputs = order.inputs.map((input) => decayed.find((lot) => lot.lotId === input.lotId));
  const locked = inputs as WildlifeTradeLot[];
  if (locked.some((lot, index) => {
    const audit = order.inputs[index]!, source = provenance(lot)!;
    return !lot.reserved || source.reservedByWorkOrderId !== lockedOrder.workOrderId || lot.quantity < audit.quantity ||
      lot.ownershipRevision !== audit.startOwnershipRevision ||
      lot.freshnessRevision < audit.startFreshnessRevision || source.reservationRevision !== audit.startReservationRevision + 1;
  })) return failure(aggregate, "revision_conflict");
  const rejected = locked.some((lot) => recipe.rejectInputStates.includes(lot.freshness as RuntimeFreshnessState));
  if (rejected) {
    const failed: WildlifeProcessingWorkOrder = { ...order, status: "failed_spoiled", failureReason: "input_spoiled_after_lazy_decay", revision: order.revision + 1 };
    const receipt = makeReceipt(action, { workOrderId: order.workOrderId, inputLotIds: order.inputLotIds, zeroYieldReason: "failed_spoiled" });
    return committed({ lifeCorpseLedger: aggregate.lifeCorpseLedger, economy: replaceEconomy(aggregate.economy, {
      activeWorldTick: action.currentWorldTick, inventoryRevision: aggregate.economy.inventoryRevision + 1,
      lots: decayed, workOrders: replaceOrder(aggregate.economy, failed), processingReceipts: appendReceipt(aggregate.economy, receipt),
    }) }, receipt);
  }
  const outputIds = recipe.outputs.map((_, index) => outputId(action.transactionId, index));
  const origin = matterOrigin(locked);
  const naturalFraction = Math.min(...locked.map((lot) => lot.naturalFraction));
  const quality = Math.min(...locked.map((lot) => lot.qualityMultiplier));
  const contamination = Math.max(...locked.map((lot) => lot.contaminationMu));
  const createdTick = Math.min(...locked.map((lot) => lot.wildlifeProvenance.freshnessCreatedTick));
  const worst = worstFreshness(locked);
  const outputs: WildlifeTradeLot[] = recipe.outputs.map((output, index) => {
    const budget = Math.min(...locked.map((lot) => lot.wildlifeProvenance.remainingFreshnessSeconds ?? Number.POSITIVE_INFINITY));
    const computed = categoryFreshness(output.itemId, action.currentWorldTick, createdTick);
    const rank: readonly TradeFreshness[] = ["stable", "cured", "fresh", "raw", "aging", "near_spoil", "slipping", "spoiled", "rotten", "decomposed"];
    const freshness = rank.indexOf(worst) > rank.indexOf(computed) ? worst : computed;
    const lifeIds = new Set(locked.map((lot) => lot.wildlifeProvenance.lifeInstanceId));
    const deathIds = new Set(locked.map((lot) => lot.wildlifeProvenance.deathEventId));
    const harvestIds = new Set(locked.map((lot) => lot.wildlifeProvenance.harvestEventId));
    return {
      lotId: outputIds[index]!, itemId: output.itemId, sourceLotIds: order.inputLotIds, legalOwnerId: `station:${order.stationId}`,
      stolenFromId: null, processingTransactionId: action.transactionId, quantity: output.quantity, originKind: outputTradeOrigin(origin),
      naturalFraction, freshness, qualityMultiplier: quality, contaminationMu: contamination,
      economyEligible: locked.every((lot) => lot.economyEligible) && origin === "natural" && naturalFraction === 1,
      reserved: false, equipped: false, ownershipRevision: 0, freshnessRevision: 0,
      wildlifeProvenance: { lifeInstanceId: lifeIds.size === 1 ? [...lifeIds][0]! : null, deathEventId: deathIds.size === 1 ? [...deathIds][0]! : null,
        harvestEventId: harvestIds.size === 1 ? [...harvestIds][0]! : null, parentLotIds: order.inputLotIds,
        transformEventId: action.transactionId, matterOrigin: origin, freshnessCreatedTick: createdTick,
        preservationProfileId: manifest.items[output.itemId]?.preservationProfileId ?? null, lastDecayEvalTick: action.currentWorldTick,
        remainingFreshnessSeconds: Number.isFinite(budget) ? budget : null, reservationRevision: 0, reservedByWorkOrderId: null },
    };
  });
  const consumed = decayed.map((lot) => {
    const audit = order.inputs.find((entry) => entry.lotId === lot.lotId); if (!audit) return lot;
    const source = provenance(lot)!;
    return withProvenance({ ...lot, quantity: lot.quantity - audit.quantity, reserved: false,
      ownershipRevision: lot.ownershipRevision + 1 }, { ...source, reservationRevision: source.reservationRevision + 1, reservedByWorkOrderId: null });
  });
  const completedOrder: WildlifeProcessingWorkOrder = { ...order, status: "completed", outputLotIds: outputIds,
    processedEventIds: distinct.map((entry) => entry.eventId),
    processedThroughSequence: distinct.at(-1)?.sequence ?? order.processedThroughSequence,
    failureReason: null, revision: order.revision + 1 };
  const receipt = makeReceipt(action, { workOrderId: order.workOrderId, inputLotIds: order.inputLotIds, outputLotIds: outputIds });
  return committed({ lifeCorpseLedger: aggregate.lifeCorpseLedger, economy: replaceEconomy(aggregate.economy, {
    activeWorldTick: action.currentWorldTick, inventoryRevision: aggregate.economy.inventoryRevision + 1,
    lots: [...consumed, ...outputs], workOrders: replaceOrder(aggregate.economy, completedOrder), processingReceipts: appendReceipt(aggregate.economy, receipt),
  }) }, receipt);
};

const applyClaim = (aggregate: WildlifeProcessingAggregate, action: ClaimWorkOrderAction): WildlifeProcessingApplyResult => {
  const order = orderById(aggregate.economy, action.workOrderId);
  if (!order) return failure(aggregate, "not_found");
  if (order.revision !== action.expectedWorkOrderRevision || aggregate.economy.inventoryRevision !== action.expectedInventoryRevision) return failure(aggregate, "revision_conflict");
  if (order.status !== "completed" || !id(action.claimantPlayerSaveId) || action.claimantPlayerSaveId !== order.initiatingPlayerSaveId) return failure(aggregate, "state_conflict");
  const outputs = aggregate.economy.lots.filter((lot) => order.outputLotIds.includes(lot.lotId));
  if (outputs.length !== order.outputLotIds.length || outputs.some((lot) => lot.legalOwnerId !== `station:${order.stationId}`)) return failure(aggregate, "revision_conflict");
  const nextOrder: WildlifeProcessingWorkOrder = { ...order, status: "claimed", revision: order.revision + 1 };
  const nextLots = aggregate.economy.lots.map((lot) => order.outputLotIds.includes(lot.lotId)
    ? { ...lot, legalOwnerId: action.claimantPlayerSaveId, ownershipRevision: lot.ownershipRevision + 1 } : lot);
  const receipt = makeReceipt(action, { workOrderId: order.workOrderId, outputLotIds: order.outputLotIds });
  return committed({ lifeCorpseLedger: aggregate.lifeCorpseLedger, economy: replaceEconomy(aggregate.economy, {
    activeWorldTick: action.currentWorldTick, inventoryRevision: aggregate.economy.inventoryRevision + 1, lots: nextLots,
    workOrders: replaceOrder(aggregate.economy, nextOrder), processingReceipts: appendReceipt(aggregate.economy, receipt),
  }) }, receipt);
};

const applyCancel = (aggregate: WildlifeProcessingAggregate, action: CancelWorkOrderAction): WildlifeProcessingApplyResult => {
  const order = orderById(aggregate.economy, action.workOrderId);
  if (!order) return failure(aggregate, "not_found");
  if (order.revision !== action.expectedWorkOrderRevision || aggregate.economy.inventoryRevision !== action.expectedInventoryRevision) return failure(aggregate, "revision_conflict");
  if (order.status !== "reserved" && order.status !== "failed_spoiled") return failure(aggregate, "state_conflict");
  const reservedInputs = order.inputLotIds.map((lotId) => aggregate.economy.lots.find((lot) => lot.lotId === lotId));
  if (reservedInputs.some((lot) => lot === undefined) || (reservedInputs as TradeLot[]).some((lot) => {
    const source = provenance(lot); return !source || !lot.reserved || source.reservedByWorkOrderId !== order.workOrderId;
  })) return failure(aggregate, "revision_conflict");
  const nextLots = aggregate.economy.lots.map((lot) => {
    if (!order.inputLotIds.includes(lot.lotId)) return lot;
    const source = provenance(lot)!;
    return withProvenance({ ...lot, reserved: false }, { ...source, reservationRevision: source.reservationRevision + 1, reservedByWorkOrderId: null });
  });
  const nextOrder: WildlifeProcessingWorkOrder = { ...order, status: "cancelled", revision: order.revision + 1 };
  const receipt = makeReceipt(action, { workOrderId: order.workOrderId, inputLotIds: order.inputLotIds });
  return committed({ lifeCorpseLedger: aggregate.lifeCorpseLedger, economy: replaceEconomy(aggregate.economy, {
    activeWorldTick: action.currentWorldTick, inventoryRevision: aggregate.economy.inventoryRevision + 1, lots: nextLots,
    workOrders: replaceOrder(aggregate.economy, nextOrder), processingReceipts: appendReceipt(aggregate.economy, receipt),
  }) }, receipt);
};

export function applyWildlifeProcessingAction(aggregateInput: WildlifeProcessingAggregate, action: WildlifeProcessingAction,
  context: WildlifeProcessingApplyContext = EMPTY_CONTEXT): WildlifeProcessingApplyResult {
  const aggregate = clone(aggregateInput);
  const base = validateBase(aggregate, action); if (base) return base;
  if (!count(context.currentLastEventSequence) || !count(context.currentWorldTick) || action.currentWorldTick !== context.currentWorldTick) return failure(aggregate, "invalid_action");
  switch (action.action) {
    case "harvest": return applyHarvest(aggregate, action);
    case "reserve": return applyReserve(aggregate, action, context);
    case "complete": return applyComplete(aggregate, action, context);
    case "claim": return applyClaim(aggregate, action);
    case "cancel": return applyCancel(aggregate, action);
  }
}
