import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../../src/generated/content-runtime.v0.1.json";
import { compileContent } from "../../src/content/compiler";
import type { ContentSource } from "../../src/content/types";
import { projectCore120Curriculum } from "./core120-runtime-artifact";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text) }));
const progression = (all: ContentSource[]): Record<string, unknown> => all.find((source) => source.path.endsWith("glyph-progression.v0.1.yaml"))!.data as Record<string, unknown>;
const catalog = (all: ContentSource[]): Record<string, unknown> => all.find((source) => source.path.endsWith("pu-120-glyph-catalog.v0.2.json"))!.data as Record<string, unknown>;

describe("core-120 runtime projector", () => {
  it("matches the checked-in generated artifact", () => {
    expect(projectCore120Curriculum(compileContent(sources()))).toEqual(generated.core120Curriculum);
  });

  it("rejects route coordinates that do not bind the authored target", () => {
    const all = sources();
    const domains = (progression(all).runtime_curriculum as Record<string, unknown>).domain_routes as Record<string, Record<string, Record<string, unknown>>>;
    domains.D_ENERGY_FIELD!.primary!.interaction_point_tiles = [0, 0];
    expect(() => projectCore120Curriculum(compileContent(all))).toThrow(/target binding/);
  });

  it("rejects catalog codepoint and cue drift", () => {
    const codepointDrift = sources();
    (catalog(codepointDrift).glyphs as Record<string, unknown>[])[0]!.displayCodepoint = "U+F1977";
    expect(() => projectCore120Curriculum(compileContent(codepointDrift))).toThrow(/codepoint/);

    const duplicateCue = sources();
    const glyph = (catalog(duplicateCue).glyphs as Record<string, unknown>[])[1]!;
    glyph.soloCueVariants = ["same", "same"];
    expect(() => projectCore120Curriculum(compileContent(duplicateCue))).toThrow(/unique|string array/);
  });
});
