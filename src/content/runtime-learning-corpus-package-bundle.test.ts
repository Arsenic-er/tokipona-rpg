import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import generatedPackageBundle from
  "../generated/learning-corpus-packages.v0.1.json";
import { readRuntimeCorpusExpansionRegistry } from
  "./runtime-corpus-expansion-registry";
import {
  computeRuntimeLearningCorpusPackageBundleDigest,
  isVerifiedRuntimeLearningCorpusPackageBundle,
  readRuntimeLearningCorpusPackageBundle,
} from "./runtime-learning-corpus-package-bundle";

const resign = (bundle: any): any => {
  const body = Object.fromEntries(Object.entries(bundle)
    .filter(([key]) => key !== "sourceDigest"));
  bundle.sourceDigest = computeRuntimeLearningCorpusPackageBundleDigest(body);
  return bundle;
};

describe("runtime learning corpus package bundle", () => {
  it("verifies the generated empty package module against the reviewed registry", () => {
    const registry = readRuntimeCorpusExpansionRegistry(generated);
    const bundle = readRuntimeLearningCorpusPackageBundle(registry, generatedPackageBundle);
    expect(bundle.admittedCorpusIds).toEqual([]);
    expect(bundle.packages).toEqual([]);
    expect(isVerifiedRuntimeLearningCorpusPackageBundle(bundle)).toBe(true);
  });

  it("rejects re-signed unknown fields and registry coverage drift", () => {
    const registry = readRuntimeCorpusExpansionRegistry(generated);
    const unknown = structuredClone(generatedPackageBundle) as any;
    unknown.runtimeOverride = true;
    expect(() => readRuntimeLearningCorpusPackageBundle(registry, resign(unknown)))
      .toThrow(/unknown or missing fields/);

    const drift = structuredClone(generatedPackageBundle) as any;
    drift.admittedCorpusIds = ["forged-corpus.v1"];
    expect(() => readRuntimeLearningCorpusPackageBundle(registry, resign(drift)))
      .toThrow(/does not cover/);
  });

  it("requires the registry to have passed its own strict reader", () => {
    const registry = structuredClone(readRuntimeCorpusExpansionRegistry(generated));
    expect(() => readRuntimeLearningCorpusPackageBundle(registry, generatedPackageBundle))
      .toThrow(/registry is not verified/);
  });
});
