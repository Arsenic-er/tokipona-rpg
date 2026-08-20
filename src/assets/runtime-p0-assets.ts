import glyphReleaseContract from "./runtime-release-contract.v0.1.json";
import { readRuntimeGlyphReleaseApproval } from "./runtime-core120-assets";

export interface RuntimeP0AssetReadiness {
  readonly approvedGlyphRelease: "blocked_pending_private_approval" | "approved";
  readonly playableContentMayClaimFullAssetAcceptance: boolean;
}

export function readRuntimeP0AssetReadiness(
  glyphRelease: unknown = glyphReleaseContract,
): RuntimeP0AssetReadiness {
  const glyphApproved = readRuntimeGlyphReleaseApproval(glyphRelease);
  return Object.freeze({
    approvedGlyphRelease: glyphApproved ? "approved" : "blocked_pending_private_approval",
    playableContentMayClaimFullAssetAcceptance: glyphApproved,
  });
}

export const runtimeP0AssetReadiness = readRuntimeP0AssetReadiness();
