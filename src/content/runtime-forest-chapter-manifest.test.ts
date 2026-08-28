import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";
import {
  isVerifiedRuntimeForestChapterManifest,
  readRuntimeForestChapterManifest,
} from "./runtime-forest-chapter-manifest.ts";

function resign(candidate: Record<string, any>): Record<string, any> {
  const body = Object.fromEntries(Object.entries(candidate.forestChapter).filter(([key]) => key !== "sourceDigest"));
  candidate.forestChapter.sourceDigest = computeRuntimeManifestDigest(body);
  return candidate;
}

describe("runtime forest chapter manifest", () => {
  it("reads a frozen, branded canonical forest chapter", () => {
    const chapter = readRuntimeForestChapterManifest(generated);
    expect(Object.isFrozen(chapter)).toBe(true);
    expect(isVerifiedRuntimeForestChapterManifest(chapter)).toBe(true);
    expect(chapter.mainSceneIds).toHaveLength(7);
    expect(chapter.optionalSceneIds).toEqual([
      "scene.valley.den_bypass", "scene.valley.safe_range",
    ]);
    expect(chapter.activeWordIds).toEqual(["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"]);
    expect(chapter.allocation.modeIds).toEqual([
      "settlement_priority", "wetland_priority", "road_trade_priority",
    ]);
  });

  it.each([
    ["segment timing", (chapter: any) => { chapter.segments[0].minuteRange = [1, 30]; }, /segment/],
    ["main-scene order", (chapter: any) => { [chapter.mainSceneIds[0], chapter.mainSceneIds[1]] = [chapter.mainSceneIds[1], chapter.mainSceneIds[0]]; }, /main scene/],
    ["medium auto-grant", (chapter: any) => { chapter.medium.automaticWordMasteryForbidden = false; }, /medium/],
    ["hermit route", (chapter: any) => { chapter.medium.hermitRouteIds[0] = "medium.ask_external_trader"; }, /medium/],
    ["large-creature kill requirement", (chapter: any) => { chapter.largeCreature.mandatoryKill = true; }, /large creature/],
    ["allocation benefit", (chapter: any) => { chapter.allocation.benefitIdsByMode.settlement_priority[0] = "forged"; }, /allocation/],
    ["allocation cost", (chapter: any) => { chapter.allocation.costIdsByMode.wetland_priority[0] = "forged"; }, /allocation/],
    ["old-mine guard", (chapter: any) => { chapter.postChapterBoundaryRequiresEpilogue = false; }, /old-mine/],
  ] as const)("rejects a digest-recomputed %s drift", (_name, mutate, message) => {
    const candidate = structuredClone(generated) as Record<string, any>;
    mutate(candidate.forestChapter);
    expect(() => readRuntimeForestChapterManifest(resign(candidate))).toThrow(message);
  });
});
