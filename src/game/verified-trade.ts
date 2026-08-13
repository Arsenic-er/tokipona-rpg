import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeTradeManifest } from "../content/runtime-trade-manifest";
import { decayWildlifeLotToTick } from "./wildlife-processing";
import type { SessionEconomyState } from "./economy-state";
import type { MerchantState, TradeLot, TradeReceipt } from "./trade";
import {
  createCrossSaveReceiptId,
  createCrossSaveTransactionId,
  sha256Canonical,
  type JsonValue,
} from "../persistence/cross-save-wal";

const manifest = readRuntimeTradeManifest(generatedRuntimeArtifact);
export const verifiedTradeManifest = () => manifest;

export interface VerifiedSellQuoteLine {
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly ownershipRevision: number;
  readonly freshnessRevision: number;
  readonly qualityMultiplier: number;
  readonly unitPriceCoin: number;
  readonly demandMultiplier: number;
}

export interface VerifiedSellQuote {
  readonly quoteId: `quote:sha256:${string}`;
  readonly playerSaveId: string;
  readonly merchantId: string;
  readonly priceTableVersion: string;
  readonly demandRevision: number;
  readonly lineItems: readonly VerifiedSellQuoteLine[];
  readonly totalCoin: number;
  readonly issuedTick: number;
  readonly expiresTick: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  readonly quoteSequence: number;
  readonly quotePayloadHash: `sha256:${string}`;
  readonly consumed: false;
}

export interface VerifiedQuoteRequest {
  readonly playerSaveId: string;
  readonly merchantId: string;
  readonly lotId: string;
  readonly quantity: number;
  readonly currentWorldTick: number;
}

export type VerifiedQuoteResult = Readonly<{
  accepted: true;
  quote: VerifiedSellQuote;
  decayedLot: TradeLot;
}> | Readonly<{ accepted: false; reason: string }>;

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const identityMaterial = (quote: Pick<VerifiedSellQuote, "merchantId" | "playerSaveId" | "demandRevision" | "lineItems" | "quoteSequence">): JsonValue => [
  quote.merchantId,
  quote.playerSaveId,
  quote.demandRevision,
  [...quote.lineItems].sort((left, right) => left.lotId.localeCompare(right.lotId)).map((line) => [
    line.lotId, line.ownershipRevision, line.freshnessRevision,
  ]),
  quote.quoteSequence,
];
export const deriveVerifiedSellQuoteId = (quote: Pick<VerifiedSellQuote,
  "merchantId" | "playerSaveId" | "demandRevision" | "lineItems" | "quoteSequence">): `quote:sha256:${string}` =>
  `quote:sha256:${sha256Canonical(identityMaterial(quote)).slice(7)}`;

export const computeVerifiedSellQuotePayloadHash = (quote: Omit<VerifiedSellQuote, "quotePayloadHash" | "consumed">): `sha256:${string}` =>
  sha256Canonical(quote as unknown as JsonValue);

const merchantState = (economy: SessionEconomyState, merchantId: string): MerchantState | undefined =>
  economy.merchantStates.find((state) => state.merchantId === merchantId);

const currentPrice = (lot: TradeLot, merchantId: string, quantity: number, soldUnits: number):
Readonly<{ unitPriceCoin: number; totalCoin: number }> | null => {
  const item = manifest.items[lot.itemId];
  const merchant = manifest.activeMerchants[merchantId];
  if (!item || !merchant || !item.playerCanSell || item.buyer !== merchantId || !merchant.buys.includes(item.category)) return null;
  const freshness = manifest.freshnessMultipliers[lot.freshness];
  if (freshness === null || freshness === undefined || freshness <= 0 || lot.qualityMultiplier < manifest.minimumSellQuality ||
      lot.qualityMultiplier > manifest.qualityMultiplierRange[1] || lot.contaminationMu !== 0 || !lot.economyEligible || lot.originKind !== "natural" ||
      lot.naturalFraction !== 1 || lot.qualityMultiplier < manifest.minimumSellQuality || lot.reserved || lot.equipped || lot.stolenFromId !== null ||
      lot.legalOwnerId === null || quantity <= 0 || quantity > lot.quantity) return null;
  const unitPriceCoin = Math.floor(item.basePlayerSellCoin * freshness * lot.qualityMultiplier * manifest.currentDemandMultiplier);
  const remainingFull = Math.max(0, merchant.fullPriceUnitsPerRestock - soldUnits);
  const fullUnits = Math.min(quantity, remainingFull);
  const excessUnits = quantity - fullUnits;
  if (merchant.excessPolicy === "reject" && excessUnits > 0) return null;
  const fullSubtotal = Math.floor(item.basePlayerSellCoin * freshness * lot.qualityMultiplier * manifest.currentDemandMultiplier * fullUnits);
  const excessSubtotal = Math.floor(item.basePlayerSellCoin * freshness * lot.qualityMultiplier * manifest.currentDemandMultiplier * manifest.quarterPriceMultiplier * excessUnits);
  if (unitPriceCoin <= 0 || fullUnits > 0 && fullSubtotal <= 0 || excessUnits > 0 && excessSubtotal <= 0) return null;
  return { unitPriceCoin, totalCoin: fullSubtotal + excessSubtotal };
};

export const createVerifiedSellQuote = (economy: SessionEconomyState, request: VerifiedQuoteRequest): VerifiedQuoteResult => {
  if (!request.playerSaveId || !request.merchantId || !request.lotId || !integer(request.quantity) || request.quantity <= 0 ||
      !integer(request.currentWorldTick) || economy.activeWorldTick !== request.currentWorldTick) return { accepted: false, reason: "invalid_request" };
  const merchant = manifest.activeMerchants[request.merchantId];
  const state = merchantState(economy, request.merchantId);
  const lot = economy.lots.find((candidate) => candidate.lotId === request.lotId);
  if (!merchant || !state || !lot || state.priceTableVersion !== manifest.priceTableVersion || lot.legalOwnerId !== request.playerSaveId) {
    return { accepted: false, reason: "ineligible" };
  }
  let decayedLot: TradeLot;
  try { decayedLot = decayWildlifeLotToTick(lot, request.currentWorldTick); } catch { return { accepted: false, reason: "invalid_provenance" }; }
  const price = currentPrice(decayedLot, request.merchantId, request.quantity, state.soldUnitsSinceRestock);
  if (!price) return { accepted: false, reason: "ineligible" };
  const quoteSequence = economy.quoteSequence + 1;
  const lineItems: readonly VerifiedSellQuoteLine[] = Object.freeze([Object.freeze({
    lotId: lot.lotId, itemId: lot.itemId, quantity: request.quantity, ownershipRevision: decayedLot.ownershipRevision,
    freshnessRevision: decayedLot.freshnessRevision, qualityMultiplier: decayedLot.qualityMultiplier,
    unitPriceCoin: price.unitPriceCoin, demandMultiplier: manifest.currentDemandMultiplier,
  })]);
  const identity = { merchantId: request.merchantId, playerSaveId: request.playerSaveId,
    demandRevision: state.demandRevision, lineItems, quoteSequence };
  const lotChangedByDecay = sha256Canonical(lot as unknown as JsonValue) !== sha256Canonical(decayedLot as unknown as JsonValue);
  const unsignedQuote = { quoteId: deriveVerifiedSellQuoteId(identity), ...identity,
    priceTableVersion: manifest.priceTableVersion, totalCoin: price.totalCoin, issuedTick: request.currentWorldTick,
    expiresTick: request.currentWorldTick + manifest.quoteLifetimeActiveSeconds, walletRevision: economy.walletRevision,
    inventoryRevision: economy.inventoryRevision + (lotChangedByDecay ? 1 : 0) };
  const quote: VerifiedSellQuote = Object.freeze({ ...unsignedQuote,
    quotePayloadHash: computeVerifiedSellQuotePayloadHash(unsignedQuote), consumed: false });
  return { accepted: true, quote, decayedLot };
};

export const canonicalVerifiedSellKey = (quote: VerifiedSellQuote): string => JSON.stringify({
  player_save_id: quote.playerSaveId, merchant_id: quote.merchantId, quote_id: quote.quoteId,
});
export const createVerifiedSellTransactionId = (quote: VerifiedSellQuote): string =>
  createCrossSaveTransactionId("sell", canonicalVerifiedSellKey(quote));

export type VerifiedSellCommitResult = Readonly<{ committed: true; duplicate: false; economy: SessionEconomyState; receipt: TradeReceipt }> |
  Readonly<{ committed: false; duplicate: boolean; reason: string; economy: SessionEconomyState; receipt: TradeReceipt | null }>;

export const commitVerifiedSellQuote = (
  economy: SessionEconomyState,
  quote: VerifiedSellQuote,
  currentWorldTick: number,
): VerifiedSellCommitResult => {
  const transactionId = createVerifiedSellTransactionId(quote);
  const prior = economy.tradeReceipts.find((receipt) => receipt.transactionId === transactionId);
  if (prior) return prior.quoteId === quote.quoteId ? { committed: false, duplicate: true, reason: "duplicate", economy, receipt: prior } :
    { committed: false, duplicate: false, reason: "transaction_payload_conflict", economy, receipt: prior };
  const { quotePayloadHash, consumed: _consumed, ...unsignedQuote } = quote;
  if (deriveVerifiedSellQuoteId(quote) !== quote.quoteId || computeVerifiedSellQuotePayloadHash(unsignedQuote) !== quotePayloadHash ||
      quote.priceTableVersion !== manifest.priceTableVersion || quote.consumed !== false ||
      !integer(currentWorldTick) || currentWorldTick < quote.issuedTick || currentWorldTick > quote.expiresTick || quote.lineItems.length !== 1) {
    return { committed: false, duplicate: false, reason: "invalid_quote", economy, receipt: null };
  }
  const line = quote.lineItems[0]!;
  const lot = economy.lots.find((candidate) => candidate.lotId === line.lotId);
  const state = merchantState(economy, quote.merchantId);
  if (!lot || !state || lot.legalOwnerId !== quote.playerSaveId || economy.walletRevision !== quote.walletRevision ||
      economy.inventoryRevision !== quote.inventoryRevision || economy.quoteSequence !== quote.quoteSequence || state.demandRevision !== quote.demandRevision ||
      lot.ownershipRevision !== line.ownershipRevision || lot.freshnessRevision !== line.freshnessRevision || lot.quantity < line.quantity) {
    return { committed: false, duplicate: false, reason: "quote_stale", economy, receipt: null };
  }
  let decayed: TradeLot;
  try { decayed = decayWildlifeLotToTick(lot, currentWorldTick); } catch { return { committed: false, duplicate: false, reason: "invalid_provenance", economy, receipt: null }; }
  if (decayed.freshnessRevision !== line.freshnessRevision || decayed.freshness !== lot.freshness) {
    return { committed: false, duplicate: false, reason: "quote_stale", economy, receipt: null };
  }
  const price = currentPrice(decayed, quote.merchantId, line.quantity, state.soldUnitsSinceRestock);
  if (!price || price.totalCoin !== quote.totalCoin || price.unitPriceCoin !== line.unitPriceCoin || line.itemId !== lot.itemId || line.demandMultiplier !== manifest.currentDemandMultiplier ||
      line.qualityMultiplier !== lot.qualityMultiplier) return { committed: false, duplicate: false, reason: "forged_quote", economy, receipt: null };
  const nextLot: TradeLot = { ...lot, quantity: lot.quantity - line.quantity, ownershipRevision: lot.ownershipRevision + 1 };
  const nextMerchant: MerchantState = { ...state, demandRevision: state.demandRevision + 1,
    soldUnitsSinceRestock: state.soldUnitsSinceRestock + line.quantity };
  const receipt: TradeReceipt = Object.freeze({ transactionId, quoteId: quote.quoteId, merchantId: quote.merchantId as TradeReceipt["merchantId"],
    lotId: lot.lotId, itemId: lot.itemId, quantity: line.quantity, coinDelta: quote.totalCoin, committedWorldTick: currentWorldTick });
  const next: SessionEconomyState = { ...economy, coin: economy.coin + quote.totalCoin, walletRevision: economy.walletRevision + 1,
    inventoryRevision: economy.inventoryRevision + 1, lots: economy.lots.map((candidate) => candidate.lotId === lot.lotId ? nextLot : candidate),
    merchantStates: economy.merchantStates.map((candidate) => candidate.merchantId === state.merchantId ? nextMerchant : candidate),
    tradeReceipts: [...economy.tradeReceipts, receipt] };
  return { committed: true, duplicate: false, economy: next, receipt };
};

export const verifiedSellReceiptId = (quote: VerifiedSellQuote): string =>
  createCrossSaveReceiptId(createVerifiedSellTransactionId(quote), "sell");
