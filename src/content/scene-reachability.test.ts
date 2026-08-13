import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent, ContentValidationError } from "./compiler";
import type { ContentObject, ContentSource } from "./types";

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

function objectArray(root: ContentObject, key: string): ContentObject[] {
  const value = root[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value as ContentObject[];
}

describe("canonical scene static reachability gate", () => {
  it("places every N00/N01/N02 entrance in empty space directly above collision support", () => {
    const manifest = compileContent(repositorySources());
    for (const scene of Object.values(manifest.indexes.scenes)) {
      const size = scene.size_tiles as ContentObject;
      const height = size.height as number;
      const width = size.width as number;
      const rows = scene.collision_rows_top_down as string[];
      for (const entrance of objectArray(scene, "entrances")) {
        const [x, y] = entrance.spawn_tile as unknown as [number, number];
        const supportRow = height - y;
        expect(x, `${scene.scene_id}/${entrance.entrance_id} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${scene.scene_id}/${entrance.entrance_id} x`).toBeLessThan(width);
        expect(rows[supportRow - 1]?.[x], `${scene.scene_id}/${entrance.entrance_id} standing tile`).toBe(".");
        expect(rows[supportRow]?.[x], `${scene.scene_id}/${entrance.entrance_id} support`).toBe("#");
      }
    }
  });

  it("rejects a sealed N01 exit instead of enlarging its trigger to hide unreachable terrain", () => {
    const sources = repositorySources();
    const source = sources.find((item) => item.path.endsWith("scenes/valley-stream-section.v0.1.yaml"));
    if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) throw new Error("N01 source missing");
    const scene = source.data as Record<string, unknown>;
    const rows = scene.collision_rows_top_down as string[];
    for (let row = 3; row <= 8; row += 1) rows[row] = `${rows[row]!.slice(0, 30)}##`;
    try {
      compileContent(sources);
      throw new Error("Expected unreachable exit rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "scene.exit_unreachable" })]),
      );
    }
  });
});
