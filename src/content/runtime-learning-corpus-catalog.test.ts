import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import generatedPackageBundle from
  "../generated/learning-corpus-packages.v0.1.json";
import {
  computeRuntimeLearningCorpusCatalogDigest,
  isVerifiedRuntimeLearningCorpusCatalog,
  readRuntimeLearningCorpusCatalog,
} from "./runtime-learning-corpus-catalog";
import { computeRuntimeLearningCorpusPackageBundleDigest } from
  "./runtime-learning-corpus-package-bundle";

const resign = (artifact: any): any => {
  const body = Object.fromEntries(Object.entries(artifact.learningCorpusCatalog)
    .filter(([key]) => key !== "sourceDigest"));
  artifact.learningCorpusCatalog.sourceDigest = computeRuntimeLearningCorpusCatalogDigest(body);
  return artifact;
};

describe("runtime learning corpus catalog", () => {
  it("verifies the explicit empty catalog while all expansion phases remain pending", () => {
    const runtime = readRuntimeLearningCorpusCatalog(generated, generatedPackageBundle);
    expect(runtime.registry.admittedCorpusIds).toEqual([]);
    expect(runtime.catalog.packages).toEqual([]);
    expect(runtime.catalog.admittedCorpusIds).toEqual([]);
    expect(isVerifiedRuntimeLearningCorpusCatalog(runtime.catalog)).toBe(true);
  });

  it("rejects tampering, admission drift, and unknown runtime overrides", () => {
    const tampered = structuredClone(generated) as any;
    tampered.learningCorpusCatalog.registryId = "forged.registry";
    expect(() => readRuntimeLearningCorpusCatalog(tampered, generatedPackageBundle))
      .toThrow(/identity|digest/);

    const drift = structuredClone(generated) as any;
    drift.learningCorpusCatalog.admittedCorpusIds = ["forged-corpus.v1"];
    resign(drift);
    expect(() => readRuntimeLearningCorpusCatalog(drift, generatedPackageBundle))
      .toThrow(/admission order/);

    const override = structuredClone(generated) as any;
    override.learningCorpusCatalog.runtimeOverride = true;
    resign(override);
    expect(() => readRuntimeLearningCorpusCatalog(override, generatedPackageBundle))
      .toThrow(/unknown or missing fields/);

    const forgedBundle = structuredClone(generatedPackageBundle) as any;
    forgedBundle.registryId = "forged.registry";
    const bundleBody = Object.fromEntries(Object.entries(forgedBundle)
      .filter(([key]) => key !== "sourceDigest"));
    forgedBundle.sourceDigest = computeRuntimeLearningCorpusPackageBundleDigest(bundleBody);
    expect(() => readRuntimeLearningCorpusCatalog(generated, forgedBundle))
      .toThrow(/identity/);
  });
});
