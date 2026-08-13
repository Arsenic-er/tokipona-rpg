import { describe, expect, it } from "vitest";
import {
  CONTENT_RUNTIME_ARTIFACT,
  CONTENT_RUNTIME_SOURCE_DIGEST,
  parseGeneratedRuntimeArtifact,
  TELO_LENGTH_PROFILES,
} from "./content-profiles";

describe("generated telo content profiles", () => {
  it("exposes the YAML-derived golden geometry and MP values", () => {
    expect(TELO_LENGTH_PROFILES.short).toMatchObject({
      nominalLengthPx: 16,
      minimumRealizedLengthPx: 8,
      activationMp: 6,
      crossSectionWidthPx: 12,
    });
    expect(TELO_LENGTH_PROFILES.default).toMatchObject({
      nominalLengthPx: 32,
      minimumRealizedLengthPx: 24,
      activationMp: 5,
      crossSectionWidthPx: 12,
    });
    expect(TELO_LENGTH_PROFILES.long).toMatchObject({
      nominalLengthPx: 64,
      minimumRealizedLengthPx: 40,
      activationMp: 10,
      crossSectionWidthPx: 12,
    });
    expect(CONTENT_RUNTIME_SOURCE_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("freezes the validated browser runtime view", () => {
    expect(Object.isFrozen(CONTENT_RUNTIME_ARTIFACT)).toBe(true);
    expect(Object.isFrozen(CONTENT_RUNTIME_ARTIFACT.source)).toBe(true);
    expect(Object.isFrozen(CONTENT_RUNTIME_ARTIFACT.telo)).toBe(true);
    expect(Object.isFrozen(TELO_LENGTH_PROFILES)).toBe(true);
    expect(Object.isFrozen(TELO_LENGTH_PROFILES.short)).toBe(true);
  });

  it("fails closed when a generated profile is tampered", () => {
    const tampered = structuredClone(CONTENT_RUNTIME_ARTIFACT) as unknown as {
      telo: { profiles: { short: { activationMp: number } } };
    };
    tampered.telo.profiles.short.activationMp = -1;

    expect(() => parseGeneratedRuntimeArtifact(tampered)).toThrowError(
      "Generated telo short profile is invalid.",
    );
  });
});
