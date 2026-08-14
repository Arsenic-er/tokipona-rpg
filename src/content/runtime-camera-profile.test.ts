import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import {
  computeRuntimePortraitCameraDigest,
  isVerifiedRuntimePortraitCameraProfile,
  readRuntimePortraitCameraProfile,
} from "./runtime-camera-profile";

const clone = (): Record<string, any> => structuredClone(generated) as Record<string, any>;
const resign = (candidate: Record<string, any>): void => {
  const payload = Object.fromEntries(Object.entries(candidate.cameraProfile).filter(([key]) => key !== "sourceDigest"));
  candidate.cameraProfile.sourceDigest = computeRuntimePortraitCameraDigest(payload);
};

describe("runtime portrait camera manifest", () => {
  it("reads and brands the canonical generated profile", () => {
    const profile = readRuntimePortraitCameraProfile(generated);
    expect(profile).toMatchObject({
      profileId: "portrait_scroll.v0.1",
      viewportPx: { width: 180, height: 320 },
      focusAnchorNormalized: { x: 0.5, y: 0.62 },
      clampToSceneBounds: true,
      pixelSnap: true,
    });
    expect(isVerifiedRuntimePortraitCameraProfile(profile)).toBe(true);
    expect(isVerifiedRuntimePortraitCameraProfile(structuredClone(profile))).toBe(false);
  });

  it("rejects unsigned and re-signed noncanonical geometry", () => {
    const unsigned = clone();
    unsigned.cameraProfile.viewportPx.width = 181;
    expect(() => readRuntimePortraitCameraProfile(unsigned)).toThrow(/digest mismatch/);
    const resigned = clone();
    resigned.cameraProfile.focusAnchorNormalized.y = 0.5;
    resign(resigned);
    expect(() => readRuntimePortraitCameraProfile(resigned)).toThrow(/geometry is noncanonical/);
  });

  it("rejects unknown override fields even when re-signed", () => {
    const candidate = clone();
    candidate.cameraProfile.runtimeOverride = { followPlayer: false };
    resign(candidate);
    expect(() => readRuntimePortraitCameraProfile(candidate)).toThrow(/unknown or missing fields/);
  });
});
