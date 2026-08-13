import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeSurvivalConsumptionManifest } from "../content/runtime-survival-consumption-manifest";
import { createCrossSaveReceiptId, createCrossSaveTransactionId, sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import type { SurvivalSave } from "./survival";
import { isTradeLotState, type SessionEconomyState } from "./economy-state";
import { decayWildlifeLotToTick } from "./wildlife-processing";

export interface InventoryConsumptionAction {
  readonly transactionId: string;
  readonly canonicalIdempotencyKey: string;
  readonly playerSaveId: string;
  readonly lotId: string;
  readonly quantity: number;
  readonly consumptionSequence: number;
  readonly currentWorldTick: number;
  readonly expectedInventoryRevision: number;
  readonly expectedLotOwnershipRevision: number;
  readonly expectedLotFreshnessRevision: number;
  readonly expectedSurvivalRevision: number;
}

export interface InventoryConsumptionReceipt {
  readonly receiptId: string;
  readonly transactionId: string;
  readonly transactionKind: "consume";
  readonly playerSaveId: string;
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly satietyDelta: number;
  readonly hydrationDelta: number;
  readonly committedWorldTick: number;
}

export type InventoryConsumptionResult = Readonly<{
  committed: true;
  economy: SessionEconomyState;
  survival: SurvivalSave;
  receipt: InventoryConsumptionReceipt;
}> | Readonly<{
  committed: false;
  reason: "invalid_action" | "revision_conflict" | "not_found" | "ineligible_input" | "spoiled" | "feature_unavailable";
}>;

const manifest = readRuntimeSurvivalConsumptionManifest(generated);
export const survivalConsumptionManifest = () => manifest;
const count = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const nonempty = (value: string): boolean => value.trim().length > 0;
const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export const canonicalInventoryConsumptionKey = (action: Pick<InventoryConsumptionAction,
  "playerSaveId" | "lotId" | "consumptionSequence">): string =>
  sha256Canonical({ player_save_id: action.playerSaveId, consumable_source_id: action.lotId,
    consumption_sequence: action.consumptionSequence } as JsonValue);

export const inventoryConsumptionTransactionId = (canonicalKey: string): string =>
  createCrossSaveTransactionId(manifest.transactionKind, canonicalKey);

export const materializeInventoryConsumptionAction = (
  requested: Omit<InventoryConsumptionAction, "transactionId" | "canonicalIdempotencyKey">,
): InventoryConsumptionAction => {
  const canonicalIdempotencyKey = canonicalInventoryConsumptionKey(requested);
  return Object.freeze({ ...requested, canonicalIdempotencyKey,
    transactionId: inventoryConsumptionTransactionId(canonicalIdempotencyKey) });
};

export const applyInventoryConsumption = (
  economy: SessionEconomyState,
  survival: SurvivalSave,
  action: InventoryConsumptionAction,
): InventoryConsumptionResult => {
  if (!nonempty(action.playerSaveId) || !nonempty(action.lotId) || !count(action.quantity) || action.quantity === 0 ||
      !count(action.consumptionSequence) || !count(action.currentWorldTick) || !count(action.expectedInventoryRevision) ||
      !count(action.expectedLotOwnershipRevision) || !count(action.expectedLotFreshnessRevision) ||
      !count(action.expectedSurvivalRevision) || action.canonicalIdempotencyKey !== canonicalInventoryConsumptionKey(action) ||
      action.transactionId !== inventoryConsumptionTransactionId(action.canonicalIdempotencyKey) ||
      action.currentWorldTick !== survival.worldTicks || economy.activeWorldTick !== survival.worldTicks) {
    return { committed: false, reason: "invalid_action" };
  }
  if (economy.inventoryRevision !== action.expectedInventoryRevision || survival.revision !== action.expectedSurvivalRevision) {
    return { committed: false, reason: "revision_conflict" };
  }
  const lot = economy.lots.find((candidate) => candidate.lotId === action.lotId);
  if (!lot) return { committed: false, reason: "not_found" };
  if (lot.ownershipRevision !== action.expectedLotOwnershipRevision || lot.freshnessRevision !== action.expectedLotFreshnessRevision) {
    return { committed: false, reason: "revision_conflict" };
  }
  const profile = manifest.profiles[lot.itemId];
  if (!profile) return { committed: false, reason: "feature_unavailable" };
  if (!manifest.wildlifeInventoryConsumableIds.includes(lot.itemId) ||
      !profile.requirements.includes("cooked") || !profile.requirements.includes("not_spoiled")) {
    return { committed: false, reason: "ineligible_input" };
  }
  if (!isTradeLotState(lot) || lot.originKind !== "natural" || lot.naturalFraction !== 1 || !lot.economyEligible ||
      lot.legalOwnerId !== action.playerSaveId || lot.stolenFromId !== null || lot.reserved || lot.equipped ||
      lot.contaminationMu !== 0 || lot.quantity < action.quantity || !lot.wildlifeProvenance ||
      lot.wildlifeProvenance.matterOrigin !== "natural") return { committed: false, reason: "ineligible_input" };
  let decayed;
  try { decayed = decayWildlifeLotToTick(lot, action.currentWorldTick); }
  catch { return { committed: false, reason: "invalid_action" }; }
  if (["spoiled", "decomposed", "rotten"].includes(decayed.freshness)) return { committed: false, reason: "spoiled" };
  const nextLot = { ...decayed, quantity: decayed.quantity - action.quantity,
    ownershipRevision: decayed.ownershipRevision + 1 };
  const beforeSatiety = survival.satiety, beforeHydration = survival.hydration;
  const nextSurvival: SurvivalSave = {
    ...survival,
    satiety: clamp(survival.satiety + profile.satietyDelta * action.quantity),
    hydration: clamp(survival.hydration + profile.hydrationDelta * action.quantity),
    revision: survival.revision + 1,
    receipts: [...survival.receipts, createCrossSaveReceiptId(action.transactionId, "consume")],
  };
  const receipt: InventoryConsumptionReceipt = Object.freeze({
    receiptId: createCrossSaveReceiptId(action.transactionId, "consume"), transactionId: action.transactionId,
    transactionKind: "consume", playerSaveId: action.playerSaveId, lotId: action.lotId, itemId: lot.itemId,
    quantity: action.quantity, satietyDelta: nextSurvival.satiety - beforeSatiety,
    hydrationDelta: nextSurvival.hydration - beforeHydration, committedWorldTick: action.currentWorldTick,
  });
  return {
    committed: true,
    economy: { ...economy, inventoryRevision: economy.inventoryRevision + 1,
      lots: economy.lots.map((candidate) => candidate.lotId === action.lotId ? nextLot : candidate) },
    survival: nextSurvival,
    receipt,
  };
};
