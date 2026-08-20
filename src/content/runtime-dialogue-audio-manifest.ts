import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

export type ProceduralDialogueWaveform = "square" | "triangle";

export interface RuntimeProceduralDialogueAudioManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/audio/procedural-dialogue.v0.1.yaml";
  readonly semanticContent: "none";
  readonly externalAssetRequired: false;
  readonly progressMayDependOnAudio: false;
  readonly captionsRequired: true;
  readonly explicitInteractionOnly: true;
  readonly cadence: Readonly<{
    readonly shortNoteCount: readonly [2, 3];
    readonly longNoteCount: readonly [4, 6];
    readonly noteDurationMs: 32;
    readonly gapMs: 46;
    readonly maximumSequenceMs: 600;
  }>;
  readonly synthesis: Readonly<{
    readonly frequencyRangeHz: readonly [180, 520];
    readonly maximumGain: 0.03;
    readonly waveforms: readonly ["square", "triangle"];
    readonly attackMs: 4;
    readonly releaseMs: 8;
  }>;
}

const verified = new WeakSet<object>();

export function computeRuntimeProceduralDialogueAudioDigest(
  payload: unknown,
): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedRuntimeProceduralDialogueAudioManifest(
  value: unknown,
): value is RuntimeProceduralDialogueAudioManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeProceduralDialogueAudioManifest(
  candidate: unknown,
): RuntimeProceduralDialogueAudioManifest {
  const artifact = record(candidate, "runtime content artifact");
  const value = record(artifact.proceduralDialogueAudio, "artifact.proceduralDialogueAudio");
  exactKeys(value, ["sourceDigest", "sourcePath", "semanticContent", "externalAssetRequired",
    "progressMayDependOnAudio", "captionsRequired", "explicitInteractionOnly", "cadence",
    "synthesis"], "procedural dialogue audio manifest");
  const sourceDigest = string(value.sourceDigest, "proceduralDialogueAudio.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceDigest)) {
    throw new Error("procedural dialogue audio digest must be sha256");
  }
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeProceduralDialogueAudioDigest(payload) !== sourceDigest) {
    throw new Error("procedural dialogue audio digest mismatch");
  }
  if (value.sourcePath !== "data/audio/procedural-dialogue.v0.1.yaml" ||
      value.semanticContent !== "none" || value.externalAssetRequired !== false ||
      value.progressMayDependOnAudio !== false || value.captionsRequired !== true ||
      value.explicitInteractionOnly !== true) {
    throw new Error("procedural dialogue audio identity is noncanonical");
  }
  const cadence = record(value.cadence, "procedural dialogue cadence");
  exactKeys(cadence, ["shortNoteCount", "longNoteCount", "noteDurationMs", "gapMs",
    "maximumSequenceMs"], "procedural dialogue cadence");
  if (!exactTuple(cadence.shortNoteCount, [2, 3]) ||
      !exactTuple(cadence.longNoteCount, [4, 6]) || cadence.noteDurationMs !== 32 ||
      cadence.gapMs !== 46 || cadence.maximumSequenceMs !== 600) {
    throw new Error("procedural dialogue cadence is noncanonical");
  }
  const maximumNotes = (cadence.longNoteCount as readonly number[])[1]!;
  const derivedMaximum = maximumNotes * Number(cadence.noteDurationMs) +
    (maximumNotes - 1) * Number(cadence.gapMs);
  if (!Number.isFinite(derivedMaximum) || derivedMaximum > Number(cadence.maximumSequenceMs)) {
    throw new Error("procedural dialogue cadence exceeds its duration bound");
  }
  const synthesis = record(value.synthesis, "procedural dialogue synthesis");
  exactKeys(synthesis, ["frequencyRangeHz", "maximumGain", "waveforms", "attackMs", "releaseMs"],
    "procedural dialogue synthesis");
  if (!exactTuple(synthesis.frequencyRangeHz, [180, 520]) || synthesis.maximumGain !== 0.03 ||
      !exactTuple(synthesis.waveforms, ["square", "triangle"]) || synthesis.attackMs !== 4 ||
      synthesis.releaseMs !== 8 || !finiteNumbersDeep(synthesis)) {
    throw new Error("procedural dialogue synthesis is noncanonical");
  }
  const result = deepFreeze(structuredClone(value)) as unknown as RuntimeProceduralDialogueAudioManifest;
  verified.add(result);
  return result;
}

function exactTuple(value: unknown, expected: readonly (number | string)[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}
function finiteNumbersDeep(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteNumbersDeep);
  if (typeof value === "object" && value !== null) return Object.values(value).every(finiteNumbersDeep);
  return true;
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty`);
  return value;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
