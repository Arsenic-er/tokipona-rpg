import type {
  CapabilityMilestoneCommitPayload,
  SessionCapabilityMilestoneResult,
} from "./game-session";

export interface CapabilityMilestoneBinding {
  readonly sourcePath: string;
  readonly milestoneId: string;
  readonly writerEvent: string;
}

export interface CapabilityMilestoneMachineProjection {
  readonly sourcePath: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly contractRevision: string;
  readonly capacityMilestones: readonly Readonly<{
    milestoneId: string;
    writerEvent: string;
    resultingState: SessionCapabilityMilestoneResult;
  }>[];
}

const verifiedContracts = new WeakSet<object>();

/**
 * Opaque result accepted by the session adapter. The WeakSet check prevents a caller from
 * bypassing this content-reader boundary with a structurally similar hand-written object.
 */
export interface VerifiedCapabilityMilestoneContract extends CapabilityMilestoneCommitPayload {}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const nonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const positiveSafeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
};

const positiveFinite = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive`);
  }
  return value;
};

/**
 * Reads the machine projection produced by the content layer and resolves its bound milestone.
 * Numeric progression values come exclusively from that projection; this module has no N05 values.
 */
export function readVerifiedCapabilityMilestoneContract(
  candidate: unknown,
  binding: CapabilityMilestoneBinding,
): VerifiedCapabilityMilestoneContract {
  const root = record(candidate, "capability machine projection");
  const sourcePath = nonEmptyString(root.sourcePath, "capability sourcePath");
  const sourceDigest = nonEmptyString(root.sourceDigest, "capability sourceDigest");
  const contractRevision = nonEmptyString(root.contractRevision, "capability contractRevision");
  const milestoneId = nonEmptyString(binding.milestoneId, "capacity binding milestoneId");
  const writerEvent = nonEmptyString(binding.writerEvent, "capacity binding writerEvent");
  if (sourcePath !== nonEmptyString(binding.sourcePath, "capacity binding sourcePath")) {
    throw new Error("capacity binding sourcePath does not match the verified chapter projection");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceDigest)) {
    throw new Error("capability sourceDigest must be a sha256 digest");
  }
  if (!Array.isArray(root.capacityMilestones)) {
    throw new Error("capability capacityMilestones must be an array");
  }
  const matches = root.capacityMilestones
    .map((entry, index) => record(entry, `capacityMilestones[${index}]`))
    .filter((entry) => entry.milestoneId === milestoneId);
  if (matches.length !== 1) throw new Error(`capacity milestone ${milestoneId} must resolve exactly once`);
  const milestone = matches[0]!;
  if (nonEmptyString(milestone.writerEvent, `${milestoneId}.writerEvent`) !== writerEvent) {
    throw new Error(`capacity milestone ${milestoneId} writer event does not match its task binding`);
  }
  const rawResult = record(milestone.resultingState, `${milestoneId}.resultingState`);
  const resultingState: SessionCapabilityMilestoneResult = Object.freeze({
    expressionCapacityWords: positiveSafeInteger(
      rawResult.expressionCapacityWords,
      `${milestoneId}.expressionCapacityWords`,
    ),
    focusSlots: positiveSafeInteger(rawResult.focusSlots, `${milestoneId}.focusSlots`),
    maxMp: positiveFinite(rawResult.maxMp, `${milestoneId}.maxMp`),
  });
  const verified: VerifiedCapabilityMilestoneContract = Object.freeze({
    milestoneId,
    writerEvent,
    sourcePath,
    sourceDigest: sourceDigest as `sha256:${string}`,
    contractRevision,
    resultingState,
  });
  verifiedContracts.add(verified);
  return verified;
}

export function assertVerifiedCapabilityMilestoneContract(
  contract: VerifiedCapabilityMilestoneContract,
): void {
  if (!verifiedContracts.has(contract)) {
    throw new Error("capability milestone contract was not produced by the verified content reader");
  }
}
