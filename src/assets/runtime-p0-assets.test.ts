import { describe, expect, it } from "vitest";
import release from "./runtime-release-contract.v0.1.json";
import { readRuntimeP0AssetReadiness, runtimeP0AssetReadiness } from "./runtime-p0-assets";

function approvedRelease(): any {
  const candidate = structuredClone(release) as any;
  candidate.status = "approved";
  candidate.currentAudits = candidate.currentAudits.map((audit: any) => ({
    ...audit,
    decision: "allow",
    reasonCodes: [],
  }));
  return candidate;
}

describe("P0 external asset release gate", () => {
  it("depends only on the approved glyph release", () => {
    expect(runtimeP0AssetReadiness).toEqual({
      approvedGlyphRelease: "blocked_pending_private_approval",
      playableContentMayClaimFullAssetAcceptance: false,
    });
    expect(readRuntimeP0AssetReadiness(approvedRelease())).toEqual({
      approvedGlyphRelease: "approved",
      playableContentMayClaimFullAssetAcceptance: true,
    });
    expect(JSON.stringify(runtimeP0AssetReadiness)).not.toMatch(/pronunciation|audio|wordAudio/i);
  });

  it("fails closed for malformed, denied, or privacy-leaking glyph contracts", () => {
    expect(() => readRuntimeP0AssetReadiness({ ...release, status: "draft" }))
      .toThrow(/glyph release contract identity/);

    const leaking = structuredClone(release) as any;
    leaking.privacy.containsPrivatePaths = true;
    expect(() => readRuntimeP0AssetReadiness(leaking)).toThrow(/leaks private/);

    const contradictory = approvedRelease();
    contradictory.currentAudits[0].decision = "deny";
    contradictory.currentAudits[0].reasonCodes = ["unreviewed"];
    expect(() => readRuntimeP0AssetReadiness(contradictory)).toThrow(/denied audits/);
  });
});
