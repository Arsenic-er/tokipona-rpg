import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";

export interface RuntimeTradeMerchant {
  readonly merchantId: string;
  readonly status: "active";
  readonly buys: readonly string[];
  readonly conditionalBuys: readonly string[];
  readonly fullPriceUnitsPerRestock: number;
  readonly excessPolicy: "quarter_price" | "reject";
  readonly ownershipPolicy: "legal_only" | "fence";
}

export interface RuntimeTradeItem {
  readonly itemId: string;
  readonly category: string;
  readonly basePlayerSellCoin: number;
  readonly playerCanSell: boolean;
  readonly buyer: string | null;
}

export interface RuntimeTradeStationAuthority {
  readonly sceneId: string;
  readonly tradeEntryId: string;
  readonly npcId: string;
  readonly interactionId: string;
  readonly merchantIds: readonly string[];
  readonly targetId: string;
  readonly interactionPointPx: Readonly<{ readonly x: number; readonly y: number }>;
}

export interface RuntimeTradeManifest {
  readonly sourcePath: "data/economy/settlement-trade.v0.1.yaml";
  readonly sourceDigest: `sha256:${string}`;
  readonly contentVersion: string;
  readonly priceTableVersion: string;
  readonly quoteLifetimeActiveSeconds: number;
  readonly quoteClock: "session_monotonic_active_seconds";
  readonly transactionKind: "sell";
  readonly idempotencyKeyFields: readonly ["player_save_id", "merchant_id", "quote_id"];
  readonly quote: {
    readonly requiredFields: readonly string[];
    readonly lineItemFields: readonly string[];
    readonly quoteIdFormula: "sha256(merchant_id, player_save_id, demand_revision, sorted_lot_revisions, quote_sequence)";
    readonly singleConsumption: true;
  };
  readonly activeMerchants: Readonly<Record<string, RuntimeTradeMerchant>>;
  readonly items: Readonly<Record<string, RuntimeTradeItem>>;
  readonly freshnessMultipliers: Readonly<Record<string, number | null>>;
  readonly stationAuthorities: readonly RuntimeTradeStationAuthority[];
  readonly priceFormula: string;
  readonly quarterPriceMultiplier: 0.25;
  readonly qualityMultiplierRange: readonly [number, number];
  readonly minimumSellQuality: number;
  readonly demandMultiplierRange: readonly [number, number];
  readonly currentDemandMultiplier: number;
  readonly restrictions: Readonly<{ spoiledMeatAccepted: false; rottenHideAccepted: false; rawHideAcceptedInPrologue: false }>;
  readonly restock: Readonly<{ requiredDistinctEligibleEvents: number; eligibleEventFilter: readonly string[]; reloadRestocks: false; checkpointResetRestocks: false; repeatedEventRestocks: false }>;
  readonly walParticipants: readonly string[];
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
};
const strings = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0) ||
      new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`);
  return Object.freeze([...value]);
};
const nonNegative = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative`);
  return value;
};
const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer`);
  return Number(value);
};

export const computeRuntimeTradeDigest = (candidate: unknown): `sha256:${string}` => {
  const raw = object(candidate, "trade");
  return sha256Canonical(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest")) as JsonValue);
};

export const readRuntimeTradeManifest = (candidate: unknown): RuntimeTradeManifest => {
  const root = object(candidate, "runtime artifact");
  const raw = object(root.trade, "trade");
  if (raw.sourcePath !== "data/economy/settlement-trade.v0.1.yaml" || raw.quoteClock !== "session_monotonic_active_seconds" ||
      raw.transactionKind !== "sell") throw new Error("trade machine identity mismatch");
  const idempotencyKeyFields = strings(raw.idempotencyKeyFields, "trade.idempotencyKeyFields");
  if (JSON.stringify(idempotencyKeyFields) !== JSON.stringify(["player_save_id", "merchant_id", "quote_id"])) {
    throw new Error("trade idempotency key mismatch");
  }
  const quoteRaw = object(raw.quote, "trade.quote");
  const expectedQuoteFields = ["quote_id", "quote_payload_hash", "merchant_id", "player_save_id", "price_table_version", "demand_revision", "line_items", "total_coin", "issued_tick", "expires_tick", "wallet_revision", "inventory_revision", "quote_sequence", "consumed"];
  const expectedLineFields = ["lot_id", "item_id", "quantity", "ownership_revision", "freshness_revision", "quality_multiplier", "demand_multiplier", "unit_price_coin"];
  const requiredFields = strings(quoteRaw.requiredFields, "trade.quote.requiredFields");
  const lineItemFields = strings(quoteRaw.lineItemFields, "trade.quote.lineItemFields");
  if (JSON.stringify(requiredFields) !== JSON.stringify(expectedQuoteFields) ||
      JSON.stringify(lineItemFields) !== JSON.stringify(expectedLineFields) ||
      quoteRaw.quoteIdFormula !== "sha256(merchant_id, player_save_id, demand_revision, sorted_lot_revisions, quote_sequence)" ||
      quoteRaw.singleConsumption !== true) throw new Error("trade quote contract mismatch");
  const activeMerchants = Object.freeze(Object.fromEntries(Object.entries(object(raw.activeMerchants, "trade.activeMerchants")).map(([merchantId, value]) => {
    const merchant = object(value, `trade.activeMerchants.${merchantId}`);
    if (merchant.merchantId !== merchantId || merchant.status !== "active" ||
        (merchant.excessPolicy !== "quarter_price" && merchant.excessPolicy !== "reject") ||
        (merchant.ownershipPolicy !== "legal_only" && merchant.ownershipPolicy !== "fence")) {
      throw new Error(`trade merchant ${merchantId} is invalid`);
    }
    return [merchantId, Object.freeze({ merchantId, status: "active" as const,
      buys: strings(merchant.buys, `${merchantId}.buys`), conditionalBuys: strings(merchant.conditionalBuys, `${merchantId}.conditionalBuys`),
      fullPriceUnitsPerRestock: positiveInteger(merchant.fullPriceUnitsPerRestock, `${merchantId}.fullPriceUnitsPerRestock`),
      excessPolicy: merchant.excessPolicy, ownershipPolicy: merchant.ownershipPolicy })];
  })));
  const items = Object.freeze(Object.fromEntries(Object.entries(object(raw.items, "trade.items")).map(([itemId, value]) => {
    const item = object(value, `trade.items.${itemId}`);
    if (item.itemId !== itemId || typeof item.playerCanSell !== "boolean" ||
        (item.buyer !== null && (typeof item.buyer !== "string" || !activeMerchants[item.buyer]))) {
      throw new Error(`trade item ${itemId} is invalid`);
    }
    return [itemId, Object.freeze({ itemId, category: text(item.category, `${itemId}.category`),
      basePlayerSellCoin: nonNegative(item.basePlayerSellCoin, `${itemId}.basePlayerSellCoin`),
      playerCanSell: item.playerCanSell, buyer: item.buyer as string | null })];
  })));
  const freshnessMultipliers = Object.freeze(Object.fromEntries(Object.entries(object(raw.freshnessMultipliers, "trade.freshnessMultipliers")).map(([state, value]) => {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error(`trade freshness ${state} multiplier is invalid`);
    }
    return [state, value as number | null];
  })));
  for (const state of ["fresh", "aging", "near_spoil", "spoiled", "decomposed", "raw", "slipping", "rotten", "cured", "stable"]) {
    if (!(state in freshnessMultipliers)) throw new Error(`trade freshness ${state} missing`);
  }
  const stationAuthorities = Object.freeze((raw.stationAuthorities as unknown[]).map((value, index) => {
    const authority = object(value, `trade.stationAuthorities.${index}`);
    const merchantIds = strings(authority.merchantIds, `trade.stationAuthorities.${index}.merchantIds`);
    if (merchantIds.some((merchantId) => !activeMerchants[merchantId])) throw new Error("trade station references inactive merchant");
    const point = object(authority.interactionPointPx, "trade authority interactionPointPx");
    if (typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
      throw new Error("trade authority interaction point is invalid");
    }
    return Object.freeze({ sceneId: text(authority.sceneId, "trade authority sceneId"),
      tradeEntryId: text(authority.tradeEntryId, "trade authority tradeEntryId"), npcId: text(authority.npcId, "trade authority npcId"),
      interactionId: text(authority.interactionId, "trade authority interactionId"), merchantIds,
      targetId: text(authority.targetId, "trade authority targetId"), interactionPointPx: Object.freeze({ x: point.x, y: point.y }) });
  }));
  if (!Array.isArray(raw.stationAuthorities) || new Set(stationAuthorities.map((entry) => entry.tradeEntryId)).size !== stationAuthorities.length) {
    throw new Error("trade station authorities must be a unique array");
  }
  const sceneIndex = object(object(root.scenes, "runtime scenes").byId, "runtime scenes byId");
  for (const authority of stationAuthorities) {
    const scene = object(sceneIndex[authority.sceneId], `trade authority scene ${authority.sceneId}`);
    const targets = scene.targets; const interactions = scene.interactions; const tradeEntries = scene.tradeEntries;
    if (!Array.isArray(targets) || !targets.some((value) => object(value, "trade target").id === authority.targetId) ||
        !Array.isArray(interactions) || !interactions.some((value) => { const entry = object(value, "trade interaction"); return entry.id === authority.interactionId && entry.targetId === authority.targetId; }) ||
        !Array.isArray(tradeEntries) || !tradeEntries.some((value) => { const entry = object(value, "trade entry"); return entry.id === authority.tradeEntryId && entry.interactionId === authority.interactionId; })) {
      throw new Error("trade station authority does not match runtime scene");
    }
  }
  const qualityRange = raw.qualityMultiplierRange;
  const demandRange = raw.demandMultiplierRange;
  if (!Array.isArray(qualityRange) || qualityRange.length !== 2 || qualityRange.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
      !Array.isArray(demandRange) || demandRange.length !== 2 || demandRange.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
      raw.quarterPriceMultiplier !== .25 || typeof raw.minimumSellQuality !== "number" || raw.minimumSellQuality !== .5 ||
      typeof raw.currentDemandMultiplier !== "number" || raw.currentDemandMultiplier < Number(demandRange[0]) || raw.currentDemandMultiplier > Number(demandRange[1]) ||
      raw.priceFormula !== "floor(base * freshness * quality * demand * full_units) + floor(base * freshness * quality * demand * 0.25 * excess_units)") {
    throw new Error("trade pricing contract mismatch");
  }
  const restrictions = object(raw.restrictions, "trade.restrictions");
  if (restrictions.spoiledMeatAccepted !== false || restrictions.rottenHideAccepted !== false || restrictions.rawHideAcceptedInPrologue !== false) {
    throw new Error("trade restriction contract mismatch");
  }
  const restock = object(raw.restock, "trade.restock");
  const eligibleEventFilter = strings(restock.eligibleEventFilter, "trade.restock.eligibleEventFilter");
  if (restock.requiredDistinctEligibleEvents !== 3 || restock.reloadRestocks !== false || restock.checkpointResetRestocks !== false ||
      restock.repeatedEventRestocks !== false) throw new Error("trade restock contract mismatch");
  const walParticipants = strings(raw.walParticipants, "trade.walParticipants");
  if (JSON.stringify(walParticipants) !== JSON.stringify(["player_inventory_save", "player_wallet_save", "economy_ledger_save"])) {
    throw new Error("trade WAL participants mismatch");
  }
  const manifest: RuntimeTradeManifest = Object.freeze({ sourcePath: raw.sourcePath, sourceDigest: text(raw.sourceDigest, "trade.sourceDigest") as `sha256:${string}`,
    contentVersion: text(raw.contentVersion, "trade.contentVersion"), priceTableVersion: text(raw.priceTableVersion, "trade.priceTableVersion"),
    quoteLifetimeActiveSeconds: positiveInteger(raw.quoteLifetimeActiveSeconds, "trade.quoteLifetimeActiveSeconds"), quoteClock: raw.quoteClock,
    transactionKind: raw.transactionKind, idempotencyKeyFields: idempotencyKeyFields as RuntimeTradeManifest["idempotencyKeyFields"],
    quote: Object.freeze({ requiredFields, lineItemFields, quoteIdFormula: quoteRaw.quoteIdFormula, singleConsumption: true }),
    activeMerchants, items, freshnessMultipliers, stationAuthorities, priceFormula: raw.priceFormula as string,
    quarterPriceMultiplier: .25, qualityMultiplierRange: Object.freeze([...qualityRange]) as unknown as readonly [number, number],
    minimumSellQuality: .5, demandMultiplierRange: Object.freeze([...demandRange]) as unknown as readonly [number, number],
    currentDemandMultiplier: raw.currentDemandMultiplier as number, restrictions: Object.freeze({ spoiledMeatAccepted: false, rottenHideAccepted: false, rawHideAcceptedInPrologue: false }),
    restock: Object.freeze({ requiredDistinctEligibleEvents: 3, eligibleEventFilter, reloadRestocks: false, checkpointResetRestocks: false, repeatedEventRestocks: false }),
    walParticipants });
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.sourceDigest) || computeRuntimeTradeDigest(raw) !== manifest.sourceDigest) {
    throw new Error("trade machine digest mismatch");
  }
  return manifest;
};
