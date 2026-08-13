import {
  MERCHANT_DIRECTORY,
  TRADE_ITEMS,
  TRADE_PRICE_TABLE_VERSION,
  TRADE_SAVE_SCHEMA,
  type MerchantId,
  type MerchantState,
  type TradeFreshness,
  type TradeLot,
  type TradeOrigin,
  type TradeReceipt,
  type TradeSave,
  type TradeSnapshot,
} from "./trade";

export const SESSION_ECONOMY_SCHEMA = "tokipona.economy-state.v0.2" as const;

export interface LegacyInventoryLotSummary {
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly ownershipRevision: number;
  readonly freshnessRevision: number;
}

export interface LegacySessionEconomySummary {
  readonly coin: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  readonly lots: readonly LegacyInventoryLotSummary[];
}

export type EconomyWorkOrderStatus = "queued" | "in_progress" | "completed" | "cancelled";

/** Reserved by v0.2 for the later corpse-processing slice; no producer is enabled yet. */
export interface EconomyWorkOrder {
  readonly workOrderId: string;
  readonly recipeId: string;
  readonly inputLotIds: readonly string[];
  readonly status: EconomyWorkOrderStatus;
  readonly revision: number;
}

/** A durable processing receipt is distinct from a merchant trade receipt. */
export interface EconomyProcessingReceipt {
  readonly transactionId: string;
  readonly workOrderId: string;
  readonly inputLotIds: readonly string[];
  readonly outputLotIds: readonly string[];
  readonly committedWorldTick: number;
}

export interface SessionEconomyState {
  readonly schema: typeof SESSION_ECONOMY_SCHEMA;
  readonly coin: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  readonly quoteSequence: number;
  readonly lots: readonly TradeLot[];
  readonly merchantStates: readonly MerchantState[];
  readonly workOrders: readonly EconomyWorkOrder[];
  readonly tradeReceipts: readonly TradeReceipt[];
  readonly processingReceipts: readonly EconomyProcessingReceipt[];
}

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const ORIGINS: readonly TradeOrigin[] = [
  "natural", "manifested", "relief", "quest", "borrowed", "stolen", "legacy_unknown",
];
const FRESHNESS: readonly TradeFreshness[] = [
  "fresh", "aging", "near_spoil", "spoiled", "decomposed", "raw", "cured", "stable", "rotten",
];

export const isTradeLotState = (value: unknown): value is TradeLot => {
  if (!isRecord(value) || !isId(value.lotId) || !isId(value.itemId) ||
      !Array.isArray(value.sourceLotIds) || !value.sourceLotIds.every(isId) || !unique(value.sourceLotIds) ||
      !(value.legalOwnerId === null || isId(value.legalOwnerId)) ||
      !(value.stolenFromId === null || isId(value.stolenFromId)) ||
      !(value.processingTransactionId === null || isId(value.processingTransactionId)) ||
      !isCount(value.quantity) || !ORIGINS.includes(value.originKind as TradeOrigin) ||
      !isFiniteNonNegative(value.naturalFraction) || value.naturalFraction > 1 ||
      !FRESHNESS.includes(value.freshness as TradeFreshness) ||
      !isFiniteNonNegative(value.qualityMultiplier) || value.qualityMultiplier < 0.25 ||
      value.qualityMultiplier > 1 || !isFiniteNonNegative(value.contaminationMu) ||
      typeof value.economyEligible !== "boolean" || typeof value.reserved !== "boolean" ||
      typeof value.equipped !== "boolean" || !isCount(value.ownershipRevision) ||
      !isCount(value.freshnessRevision)) return false;
  if (TRADE_ITEMS[value.itemId] === undefined &&
      (value.originKind !== "legacy_unknown" || value.naturalFraction !== 0 || value.economyEligible !== false)) {
    return false;
  }
  return true;
};

export const isMerchantStateValue = (value: unknown): value is MerchantState =>
  isRecord(value) && isId(value.merchantId) &&
  MERCHANT_DIRECTORY.some((merchant) => merchant.merchantId === value.merchantId) &&
  isCount(value.demandRevision) && isCount(value.soldUnitsSinceRestock) &&
  value.priceTableVersion === TRADE_PRICE_TABLE_VERSION;

export const isTradeReceiptValue = (value: unknown): value is TradeReceipt =>
  isRecord(value) && isId(value.transactionId) && isId(value.quoteId) && isId(value.merchantId) &&
  MERCHANT_DIRECTORY.some((merchant) => merchant.merchantId === value.merchantId) &&
  isId(value.lotId) && isId(value.itemId) && isCount(value.quantity) && value.quantity > 0 &&
  isCount(value.coinDelta) && isFiniteNonNegative(value.committedWorldTick);

const isWorkOrder = (value: unknown): value is EconomyWorkOrder =>
  isRecord(value) && isId(value.workOrderId) && isId(value.recipeId) &&
  Array.isArray(value.inputLotIds) && value.inputLotIds.every(isId) && unique(value.inputLotIds) &&
  ["queued", "in_progress", "completed", "cancelled"].includes(String(value.status)) && isCount(value.revision);

const isProcessingReceipt = (value: unknown): value is EconomyProcessingReceipt =>
  isRecord(value) && isId(value.transactionId) && isId(value.workOrderId) &&
  Array.isArray(value.inputLotIds) && value.inputLotIds.every(isId) && unique(value.inputLotIds) &&
  Array.isArray(value.outputLotIds) && value.outputLotIds.every(isId) && unique(value.outputLotIds) &&
  isCount(value.committedWorldTick);

export const isLegacySessionEconomySummary = (value: unknown): value is LegacySessionEconomySummary => {
  if (!isRecord(value) || "schema" in value || !isCount(value.coin) || !isCount(value.walletRevision) ||
      !isCount(value.inventoryRevision) || !Array.isArray(value.lots)) return false;
  const valid = value.lots.every((lot) => isRecord(lot) && isId(lot.lotId) && isId(lot.itemId) &&
    isCount(lot.quantity) && isCount(lot.ownershipRevision) && isCount(lot.freshnessRevision));
  return valid && unique(value.lots.map((lot) => (lot as LegacyInventoryLotSummary).lotId));
};

export const isSessionEconomyState = (value: unknown): value is SessionEconomyState => {
  if (!isRecord(value) || value.schema !== SESSION_ECONOMY_SCHEMA || !isCount(value.coin) ||
      !isCount(value.walletRevision) || !isCount(value.inventoryRevision) || !isCount(value.quoteSequence) ||
      !Array.isArray(value.lots) || !value.lots.every(isTradeLotState) ||
      !Array.isArray(value.merchantStates) || !value.merchantStates.every(isMerchantStateValue) ||
      !Array.isArray(value.workOrders) || !value.workOrders.every(isWorkOrder) ||
      !Array.isArray(value.tradeReceipts) || !value.tradeReceipts.every(isTradeReceiptValue) ||
      !Array.isArray(value.processingReceipts) || !value.processingReceipts.every(isProcessingReceipt)) return false;
  const canonicalMerchantIds = MERCHANT_DIRECTORY.map((merchant) => merchant.merchantId);
  const merchantStates = value.merchantStates as readonly MerchantState[];
  return unique(value.lots.map((lot) => lot.lotId)) &&
    merchantStates.length === canonicalMerchantIds.length &&
    canonicalMerchantIds.every((merchantId) => merchantStates.some((state) => state.merchantId === merchantId)) &&
    unique(merchantStates.map((state) => state.merchantId)) &&
    unique(value.workOrders.map((order) => order.workOrderId)) &&
    unique(value.tradeReceipts.map((receipt) => receipt.transactionId)) &&
    unique(value.processingReceipts.map((receipt) => receipt.transactionId));
};

const defaultMerchantStates = (): MerchantState[] => MERCHANT_DIRECTORY.map((merchant) => ({
  merchantId: merchant.merchantId,
  demandRevision: 0,
  soldUnitsSinceRestock: 0,
  priceTableVersion: TRADE_PRICE_TABLE_VERSION,
}));

export const createEmptySessionEconomy = (): SessionEconomyState => ({
  schema: SESSION_ECONOMY_SCHEMA,
  coin: 0,
  walletRevision: 0,
  inventoryRevision: 0,
  quoteSequence: 0,
  lots: [],
  merchantStates: defaultMerchantStates(),
  workOrders: [],
  tradeReceipts: [],
  processingReceipts: [],
});

/**
 * Old summary lots did not prove provenance. They remain addressable and keep quantities/revisions,
 * but are fail-closed for trade until a later explicit provenance repair event exists.
 */
export const migrateLegacyEconomySummary = (summary: LegacySessionEconomySummary): SessionEconomyState => {
  if (!isLegacySessionEconomySummary(summary)) throw new Error("invalid legacy economy summary");
  return {
    schema: SESSION_ECONOMY_SCHEMA,
    coin: summary.coin,
    walletRevision: summary.walletRevision,
    inventoryRevision: summary.inventoryRevision,
    quoteSequence: 0,
    lots: summary.lots.map((lot): TradeLot => ({
      ...lot,
      sourceLotIds: [],
      legalOwnerId: null,
      stolenFromId: null,
      processingTransactionId: null,
      originKind: "legacy_unknown",
      naturalFraction: 0,
      freshness: "stable",
      qualityMultiplier: 1,
      contaminationMu: 0,
      economyEligible: false,
      reserved: false,
      equipped: false,
    })),
    merchantStates: defaultMerchantStates(),
    workOrders: [],
    tradeReceipts: [],
    processingReceipts: [],
  };
};

export const normalizeSessionEconomy = (
  candidate: SessionEconomyState | LegacySessionEconomySummary,
): SessionEconomyState => {
  if (isSessionEconomyState(candidate)) return clone(candidate);
  return migrateLegacyEconomySummary(candidate);
};

export const adaptTradeSaveToSessionEconomy = (
  save: TradeSave,
  retained?: Pick<SessionEconomyState, "workOrders" | "processingReceipts">,
): SessionEconomyState => {
  const candidate: SessionEconomyState = {
    schema: SESSION_ECONOMY_SCHEMA,
    coin: save.coin,
    walletRevision: save.walletRevision,
    inventoryRevision: save.inventoryRevision,
    quoteSequence: save.quoteSequence,
    lots: clone(save.lots),
    merchantStates: clone(save.merchantStates),
    workOrders: clone(retained?.workOrders ?? []),
    tradeReceipts: clone(save.receipts),
    processingReceipts: clone(retained?.processingReceipts ?? []),
  };
  if (save.schema !== TRADE_SAVE_SCHEMA || save.lots.some((lot) => TRADE_ITEMS[lot.itemId] === undefined) ||
      !isSessionEconomyState(candidate)) {
    throw new Error("invalid complete TradeSave");
  }
  return candidate;
};

export const adaptTradeSnapshotToSessionEconomy = (snapshot: TradeSnapshot): SessionEconomyState => {
  const candidate: SessionEconomyState = {
    ...createEmptySessionEconomy(),
    coin: snapshot.coin,
    walletRevision: snapshot.walletRevision,
    inventoryRevision: snapshot.inventoryRevision,
    quoteSequence: snapshot.quoteSequence,
    lots: clone(snapshot.lots),
    merchantStates: defaultMerchantStates().map((fallback) =>
      clone(snapshot.merchantStates.find((state) => state.merchantId === fallback.merchantId) ?? fallback)),
  };
  if (!isSessionEconomyState(candidate)) throw new Error("invalid trade snapshot");
  return candidate;
};

export const exportSessionEconomyTradeSave = (economy: SessionEconomyState): TradeSave => {
  if (!isSessionEconomyState(economy)) throw new Error("invalid session economy");
  if (economy.lots.some((lot) => TRADE_ITEMS[lot.itemId] === undefined)) {
    throw new Error("session economy contains an item unknown to TradeSystem");
  }
  return {
    schema: TRADE_SAVE_SCHEMA,
    coin: economy.coin,
    walletRevision: economy.walletRevision,
    inventoryRevision: economy.inventoryRevision,
    quoteSequence: economy.quoteSequence,
    lots: clone(economy.lots),
    merchantStates: clone(economy.merchantStates),
    receipts: clone(economy.tradeReceipts),
  };
};

export const merchantStateById = (
  economy: SessionEconomyState,
  merchantId: MerchantId,
): MerchantState | undefined => economy.merchantStates.find((state) => state.merchantId === merchantId);
