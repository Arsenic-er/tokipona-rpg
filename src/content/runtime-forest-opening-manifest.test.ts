import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";
import {
  isVerifiedRuntimeForestOpeningManifest,
  readRuntimeForestOpeningManifest,
} from "./runtime-forest-opening-manifest";

function artifact(): Record<string, unknown> {
  return structuredClone(generated) as unknown as Record<string, unknown>;
}

function opening(candidate: Record<string, unknown>): Record<string, unknown> {
  return candidate.forestOpening as Record<string, unknown>;
}

function resign(candidate: Record<string, unknown>): void {
  const value = opening(candidate);
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "sourceDigest"));
  value.sourceDigest = computeRuntimeManifestDigest(body);
}

describe("runtime forest opening manifest reader", () => {
  it("accepts, freezes, and brands only the current generated projection", () => {
    const verified = readRuntimeForestOpeningManifest(artifact());

    expect(isVerifiedRuntimeForestOpeningManifest(verified)).toBe(true);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.obstacle.objectAnchorsPx)).toBe(true);
    expect(isVerifiedRuntimeForestOpeningManifest(structuredClone(verified))).toBe(false);
  });

  it("rejects forged digests and unknown fields", () => {
    const forged = artifact();
    opening(forged).sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeForestOpeningManifest(forged)).toThrow(/digest/i);

    const unknown = artifact();
    opening(unknown).unknown = true;
    resign(unknown);
    expect(() => readRuntimeForestOpeningManifest(unknown)).toThrow(/unknown|missing/i);
  });

  it.each([
    ["route order", (value: Record<string, unknown>) => (value.route as unknown[]).reverse()],
    ["semantic action", (value: Record<string, unknown>) => {
      ((value.solutions as Record<string, unknown>[])[0]!).semanticAction = "skipObstacle";
    }],
    ["glyph grant", (value: Record<string, unknown>) => {
      (value.glyphObservation as Record<string, unknown>).grantsMeaning = true;
    }],
    ["duplicate species", (value: Record<string, unknown>) => {
      const ecology = value.ecology as Record<string, unknown>;
      const species = ecology.visibleSpecies as Record<string, unknown>[];
      species[1] = structuredClone(species[0]!);
      ecology.visibleSpecies = structuredClone(species);
    }],
  ] as const)("rejects a re-signed noncanonical %s", (_label, mutate) => {
    const changed = artifact();
    mutate(opening(changed));
    resign(changed);
    expect(() => readRuntimeForestOpeningManifest(changed)).toThrow(/noncanonical|route|solution|glyph|species/i);
  });
});
