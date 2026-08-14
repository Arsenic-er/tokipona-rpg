import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import {
  computeRuntimePrologueAcceptanceDigest,
  isVerifiedRuntimePrologueAcceptanceManifest,
  readRuntimePrologueAcceptanceManifest,
} from "./runtime-prologue-acceptance-manifest";
import type { ContentSource } from "./types";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text) }));
const chapter = (all: ContentSource[]): Record<string, unknown> => all.find((source) => source.path.endsWith("ch01-world-literacy-prologue.v0.1.yaml"))!.data as Record<string, unknown>;

function resign(artifact: unknown): unknown {
  const root = artifact as { prologueAcceptance: Record<string, unknown> };
  const payload = Object.fromEntries(Object.entries(root.prologueAcceptance).filter(([key]) => key !== "sourceDigest"));
  root.prologueAcceptance.sourceDigest = computeRuntimePrologueAcceptanceDigest(payload);
  return root;
}

function expectIssue(all: ContentSource[], code: string): void {
  try { compileContent(all); throw new Error("expected compile failure"); }
  catch (error) { expect(error).toBeInstanceOf(ContentValidationError); expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })])); }
}

describe("prologue acceptance runtime contract", () => {
  it("strictly projects the event schema, exclusive taxonomy, and frozen thresholds", () => {
    const value = readRuntimePrologueAcceptanceManifest(generated);
    expect(isVerifiedRuntimePrologueAcceptanceManifest(value)).toBe(true);
    expect(value.telemetry).toMatchObject({
      schemaVersion: "prologue.telemetry.v0.1",
      includedPrimaryActivities: ["world_people_physics", "language", "long_explanation"],
      excludedActivities: ["pause", "idle", "settings", "optional_free_roam"],
      exclusivePrimaryActivity: true,
    });
    expect(value.telemetry.eventIds).toHaveLength(24);
    expect(value.acceptance.required).toMatchObject({ mandatoryKills: 0, safeRangeUsesLivingTargets: false, meaningfulWorldDeltasOnReturnMinimum: 3 });
    expect(value.acceptance.playtest).toMatchObject({ worldPeoplePhysicsTimeShareMinimum: 0.65, languageActivityTimeShareRange: [0.15, 0.25], longExplanationPanelTimeShareMaximum: 0.10, rangeTrialPermissionContentMinutesP90Maximum: 180 });
  });

  it("rejects checksum drift, re-signed taxonomy changes, unknown payload fields, and threshold changes", () => {
    const checksum = structuredClone(generated) as any;
    checksum.prologueAcceptance.acceptance.required.mandatoryKills = 1;
    expect(() => readRuntimePrologueAcceptanceManifest(checksum)).toThrow(/digest mismatch/);
    const taxonomy = structuredClone(generated) as any;
    taxonomy.prologueAcceptance.telemetry.includedPrimaryActivities = ["language", "world_people_physics", "long_explanation"];
    expect(() => readRuntimePrologueAcceptanceManifest(resign(taxonomy))).toThrow(/taxonomy/);
    const unknown = structuredClone(generated) as any;
    unknown.prologueAcceptance.telemetry.payload.rawPayloadAllowed = true;
    expect(() => readRuntimePrologueAcceptanceManifest(resign(unknown))).toThrow(/unknown or missing/);
    const threshold = structuredClone(generated) as any;
    threshold.prologueAcceptance.acceptance.playtest.worldPeoplePhysicsTimeShareMinimum = 0.5;
    expect(() => readRuntimePrologueAcceptanceManifest(resign(threshold))).toThrow(/playtest acceptance/);
  });

  it("fails compilation when telemetry or acceptance authority drifts", () => {
    const eventDrift = sources();
    (chapter(eventDrift).telemetry_events as string[]).pop();
    expectIssue(eventDrift, "chapter.telemetry_events");
    const payloadDrift = sources();
    const contract = chapter(payloadDrift).telemetry_contract as Record<string, unknown>;
    (contract.event_payload as Record<string, unknown>).forbidden_fields = [];
    expectIssue(payloadDrift, "chapter.telemetry_contract");
    const acceptanceDrift = sources();
    const acceptance = chapter(acceptanceDrift).acceptance as Record<string, unknown>;
    (acceptance.playtest_targets as Record<string, unknown>).world_people_physics_time_share_minimum = 0.5;
    expectIssue(acceptanceDrift, "chapter.acceptance_contract");
  });
});
