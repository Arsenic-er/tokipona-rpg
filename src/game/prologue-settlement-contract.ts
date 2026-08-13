import type {
  RuntimeSceneInteractionManifest,
  RuntimeSceneManifest,
  RuntimeSceneNpcManifest,
  RuntimeSceneTradeEntryManifest,
} from "../content/runtime-scene-manifest";
import type { SessionEventDraft } from "../session/adapters";
import type {
  GameSessionState,
  SessionReceiptDomain,
} from "../session/game-session";

export const SETTLEMENT_OPERATION_RECEIPT_DOMAIN: SessionReceiptDomain = "other";

export type ExactOperationReceiptState = "absent" | "duplicate" | "conflict";

const canonicalField = (value: string | number | boolean | null): string =>
  encodeURIComponent(String(value));

/**
 * Stable, versioned fingerprint for the public settlement command boundary.
 * Field names and ordering are explicit at call sites; mutable aggregate state
 * is never part of the fingerprint, so a successful command remains replayable.
 */
export const settlementOperationFingerprint = (
  operation: string,
  fields: Readonly<Record<string, string | number | boolean | null>> = {},
): string => {
  const ordered = Object.entries(fields).sort(([left], [right]) => left.localeCompare(right));
  return [
    "settlement-operation:v1",
    `operation=${canonicalField(operation)}`,
    ...ordered.map(([key, value]) => `${canonicalField(key)}=${canonicalField(value)}`),
  ].join("|");
};

export const classifySettlementOperation = (
  state: GameSessionState,
  transactionId: string,
  fingerprint: string,
): ExactOperationReceiptState => {
  const prior = state.receiptIndex[transactionId];
  if (!prior) return "absent";
  return prior.domain === SETTLEMENT_OPERATION_RECEIPT_DOMAIN && prior.payloadHash === fingerprint
    ? "duplicate"
    : "conflict";
};

export const settlementOperationReceiptDraft = (
  transactionId: string,
  fingerprint: string,
): SessionEventDraft => ({
  eventId: `session.settlement.operation.${transactionId}`,
  type: "receipt_recorded",
  payload: {
    receiptId: transactionId,
    domain: SETTLEMENT_OPERATION_RECEIPT_DOMAIN,
    payloadHash: fingerprint,
  },
});

export interface SettlementInteractionToken {
  readonly interactionId: string;
  readonly npcId?: string;
  readonly facilityId?: string;
}

export const exactManifestInteraction = (
  manifest: RuntimeSceneManifest,
  token: SettlementInteractionToken,
  expected: Readonly<{
    verb: string;
    npcProfessionId?: string;
    facilityKind?: string;
    taskId?: string;
  }>,
): RuntimeSceneInteractionManifest | null => {
  const interaction = manifest.interactions.find((candidate) => candidate.id === token.interactionId);
  if (!interaction || interaction.verb !== expected.verb) return null;
  if (token.npcId !== undefined && interaction.npcId !== token.npcId) return null;
  if (token.facilityId !== undefined && interaction.facilityId !== token.facilityId) return null;
  if (expected.taskId !== undefined && interaction.taskId !== expected.taskId) return null;
  if (expected.npcProfessionId !== undefined) {
    const npc = manifest.npcs.find((candidate) => candidate.id === interaction.npcId);
    if (!npc || npc.professionId !== expected.npcProfessionId ||
        !npc.interactionIds.includes(interaction.id)) return null;
  }
  if (expected.facilityKind !== undefined) {
    const facility = manifest.facilities.find((candidate) => candidate.id === interaction.facilityId);
    if (!facility || facility.kind !== expected.facilityKind ||
        !facility.interactionIds.includes(interaction.id)) return null;
  }
  return interaction;
};

export const authorizedTradeEntry = (
  manifest: RuntimeSceneManifest,
  token: SettlementInteractionToken,
): Readonly<{
  interaction: RuntimeSceneInteractionManifest;
  npc: RuntimeSceneNpcManifest;
  tradeEntry: RuntimeSceneTradeEntryManifest;
}> | null => {
  const interaction = exactManifestInteraction(manifest, token, {
    verb: "trade",
    npcProfessionId: "settlement.supply_trader",
    facilityKind: "trade_entry",
  });
  if (!interaction?.npcId || !interaction.facilityId) return null;
  const npc = manifest.npcs.find((candidate) => candidate.id === interaction.npcId);
  const tradeEntry = manifest.tradeEntries.find((candidate) =>
    candidate.interactionId === interaction.id && candidate.npcId === interaction.npcId
  );
  if (!npc || !tradeEntry || tradeEntry.merchantIds.length === 0) return null;
  return Object.freeze({ interaction, npc, tradeEntry });
};
