import pronunciationManifest from "./p0-pronunciation-manifest.v0.1.json";
import glyphReleaseContract from "./runtime-release-contract.v0.1.json";
import { P0_WORD_IDS, type P0WordId } from "../learning/progression";

export interface RuntimeP0AssetReadiness {
  readonly pronunciationAudio: "blocked_pending_private_assets" | "approved";
  readonly approvedGlyphRelease: "blocked_pending_private_approval" | "approved";
  readonly playableContentMayClaimFullAssetAcceptance: boolean;
  readonly wordAudioReady: Readonly<Record<P0WordId, boolean>>;
}

const record = (value: unknown, label: string): Record<string, unknown> => { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; };
const sameSet = (value: unknown, expected: readonly string[]): boolean => Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry));

export function readRuntimeP0AssetReadiness(
  pronunciation: unknown = pronunciationManifest,
  glyphRelease: unknown = glyphReleaseContract,
): RuntimeP0AssetReadiness {
  const audio = record(pronunciation, "P0 pronunciation manifest");
  if (audio.schemaVersion !== "tokipona.p0-pronunciation-assets.v0.1" || !sameSet(audio.wordIds, P0_WORD_IDS)) throw new Error("P0 pronunciation identity/word set is invalid");
  const entries = record(audio.entries, "P0 pronunciation entries");
  if (!sameSet(Object.keys(entries), P0_WORD_IDS)) throw new Error("P0 pronunciation entries must cover exactly 12 words");
  const wordAudioReady = {} as Record<P0WordId, boolean>;
  for (const wordId of P0_WORD_IDS) {
    const entry = record(entries[wordId], `P0 pronunciation ${wordId}`);
    const approved = typeof entry.audioAssetId === "string" && typeof entry.publicPath === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(String(entry.sha256)) && typeof entry.sourceUrl === "string" &&
      typeof entry.licenseSpdx === "string" && entry.redistributionApproved === true &&
      entry.languageReviewApproved === true && entry.communityReviewApproved === true;
    const empty = entry.audioAssetId === null && entry.publicPath === null && entry.sha256 === null &&
      entry.sourceUrl === null && entry.licenseSpdx === null && entry.redistributionApproved === false &&
      entry.languageReviewApproved === false && entry.communityReviewApproved === false;
    if (!approved && !empty) throw new Error(`P0 pronunciation ${wordId} is partially approved`);
    wordAudioReady[wordId] = approved;
  }
  const allAudio = Object.values(wordAudioReady).every(Boolean);
  if ((audio.status === "approved") !== allAudio || (audio.status !== "approved" && audio.status !== "blocked_pending_private_assets")) throw new Error("P0 pronunciation status does not match per-word approvals");
  const glyph = record(glyphRelease, "glyph release contract");
  const glyphApproved = glyph.status === "approved";
  if (!glyphApproved && glyph.status !== "blocked") throw new Error("glyph release status is invalid");
  return Object.freeze({ pronunciationAudio: allAudio ? "approved" : "blocked_pending_private_assets",
    approvedGlyphRelease: glyphApproved ? "approved" : "blocked_pending_private_approval",
    playableContentMayClaimFullAssetAcceptance: allAudio && glyphApproved,
    wordAudioReady: Object.freeze(wordAudioReady) });
}

export const runtimeP0AssetReadiness = readRuntimeP0AssetReadiness();
