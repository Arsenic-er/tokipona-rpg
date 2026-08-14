import pronunciationManifest from "./p0-pronunciation-manifest.v0.1.json";
import glyphReleaseContract from "./runtime-release-contract.v0.1.json";
import { P0_WORD_IDS, type P0WordId } from "../learning/progression";
import { readRuntimeGlyphReleaseApproval } from "./runtime-core120-assets";

export interface RuntimeP0AssetReadiness {
  readonly pronunciationAudio: "blocked_pending_private_assets" | "approved";
  readonly approvedGlyphRelease: "blocked_pending_private_approval" | "approved";
  readonly playableContentMayClaimFullAssetAcceptance: boolean;
  readonly wordAudioReady: Readonly<Record<P0WordId, boolean>>;
}

export interface RuntimeP0ApprovedPronunciationAssets {
  readonly entries: Readonly<Record<P0WordId, Readonly<{
    readonly assetId: string;
    readonly publicPath: string;
    readonly sha256: `sha256:${string}`;
  }>>>;
}

const record = (value: unknown, label: string): Record<string, unknown> => { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; };
const sameSet = (value: unknown, expected: readonly string[]): boolean => Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry));
const exactKeys = (value: Record<string, unknown>, expected: readonly string[], label: string): void => {
  if (!sameSet(Object.keys(value), expected)) throw new Error(`${label} contains unknown or missing fields`);
};

const PRONUNCIATION_ENTRY_KEYS = ["audioAssetId", "publicPath", "sha256", "sourceUrl", "licenseSpdx",
  "redistributionApproved", "languageReviewApproved", "communityReviewApproved"] as const;

export function readRuntimeP0AssetReadiness(
  pronunciation: unknown = pronunciationManifest,
  glyphRelease: unknown = glyphReleaseContract,
): RuntimeP0AssetReadiness {
  const parsed = readPronunciationAssets(pronunciation);
  const glyphApproved = readRuntimeGlyphReleaseApproval(glyphRelease);
  return Object.freeze({
    pronunciationAudio: parsed.allAudio ? "approved" : "blocked_pending_private_assets",
    approvedGlyphRelease: glyphApproved ? "approved" : "blocked_pending_private_approval",
    playableContentMayClaimFullAssetAcceptance: parsed.allAudio && glyphApproved,
    wordAudioReady: parsed.wordAudioReady,
  });
}

export function readApprovedRuntimeP0PronunciationAssets(
  pronunciation: unknown,
): RuntimeP0ApprovedPronunciationAssets {
  const parsed = readPronunciationAssets(pronunciation);
  if (!parsed.allAudio) throw new Error("P0 pronunciation assets are not approved");
  return Object.freeze({ entries: parsed.approvedEntries });
}

function readPronunciationAssets(pronunciation: unknown): Readonly<{
  allAudio: boolean;
  wordAudioReady: Readonly<Record<P0WordId, boolean>>;
  approvedEntries: Readonly<Record<P0WordId, Readonly<{
    assetId: string;
    publicPath: string;
    sha256: `sha256:${string}`;
  }>>>;
}> {
  const audio = record(pronunciation, "P0 pronunciation manifest");
  exactKeys(audio, ["schemaVersion", "status", "wordIds", "entries"], "P0 pronunciation manifest");
  if (audio.schemaVersion !== "tokipona.p0-pronunciation-assets.v0.1" || !sameSet(audio.wordIds, P0_WORD_IDS)) throw new Error("P0 pronunciation identity/word set is invalid");
  const entries = record(audio.entries, "P0 pronunciation entries");
  if (!sameSet(Object.keys(entries), P0_WORD_IDS)) throw new Error("P0 pronunciation entries must cover exactly 12 words");
  const wordAudioReady = {} as Record<P0WordId, boolean>;
  const approvedEntries = {} as Record<P0WordId, { assetId: string; publicPath: string; sha256: `sha256:${string}` }>;
  for (const wordId of P0_WORD_IDS) {
    const entry = record(entries[wordId], `P0 pronunciation ${wordId}`);
    exactKeys(entry, PRONUNCIATION_ENTRY_KEYS, `P0 pronunciation ${wordId}`);
    const assetId = `audio.pronunciation.${wordId}.v1`;
    const publicPath = `assets/pronunciation/${wordId}.ogg`;
    const approved = entry.audioAssetId === assetId && entry.publicPath === publicPath &&
      /^sha256:[0-9a-f]{64}$/.test(String(entry.sha256)) &&
      typeof entry.sourceUrl === "string" && /^https:\/\/[^\s]+$/.test(entry.sourceUrl) &&
      typeof entry.licenseSpdx === "string" && /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(entry.licenseSpdx) &&
      entry.redistributionApproved === true &&
      entry.languageReviewApproved === true && entry.communityReviewApproved === true;
    const empty = entry.audioAssetId === null && entry.publicPath === null && entry.sha256 === null &&
      entry.sourceUrl === null && entry.licenseSpdx === null && entry.redistributionApproved === false &&
      entry.languageReviewApproved === false && entry.communityReviewApproved === false;
    if (!approved && !empty) throw new Error(`P0 pronunciation ${wordId} is partially approved`);
    wordAudioReady[wordId] = approved;
    if (approved) {
      approvedEntries[wordId] = {
        assetId,
        publicPath,
        sha256: entry.sha256 as `sha256:${string}`,
      };
    }
  }
  const allAudio = Object.values(wordAudioReady).every(Boolean);
  if ((audio.status === "approved") !== allAudio || (audio.status !== "approved" && audio.status !== "blocked_pending_private_assets")) throw new Error("P0 pronunciation status does not match per-word approvals");
  return Object.freeze({
    allAudio,
    wordAudioReady: Object.freeze(wordAudioReady),
    approvedEntries: Object.freeze(approvedEntries),
  });
}

export const runtimeP0AssetReadiness = readRuntimeP0AssetReadiness();
