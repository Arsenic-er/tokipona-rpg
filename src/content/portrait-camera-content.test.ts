import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent, ContentValidationError } from "./compiler";
import type { ContentSource } from "./types";

type Obj = Record<string, unknown>;

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function sources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

function region(all: ContentSource[]): Obj {
  return all.find((candidate) => candidate.path.endsWith("world/regions/valley-prologue.v0.1.yaml"))!.data as Obj;
}

function expectCameraIssue(run: () => unknown): void {
  try {
    run();
    throw new Error("expected validation error");
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "region.camera_profile" }),
    ]));
  }
}

describe("portrait camera authored contract", () => {
  it("compiles the exact 180x320 two-axis follow contract", () => {
    const manifest = compileContent(sources());
    const coordinateSystem = manifest.byKind.region[0]!.content.coordinate_system as Obj;
    expect(coordinateSystem).toMatchObject({
      camera_profile_id: "portrait_scroll.v0.1",
      camera_profile: {
        viewport_px: { width: 180, height: 320 },
        focus_anchor_normalized: { x: 0.5, y: 0.62 },
        clamp_to_scene_bounds: true,
        pixel_snap: true,
      },
      scene_size_independent_from_camera: true,
    });
  });

  it("rejects profile identity and viewport drift", () => {
    const identity = sources();
    const identityCoordinateSystem = region(identity).coordinate_system as Obj;
    identityCoordinateSystem.camera_profile_id = "portrait_scroll.runtime_pending";
    expectCameraIssue(() => compileContent(identity));

    const geometry = sources();
    const geometryCoordinateSystem = region(geometry).coordinate_system as Obj;
    const camera = geometryCoordinateSystem.camera_profile as Obj;
    (camera.viewport_px as Obj).width = 181;
    expectCameraIssue(() => compileContent(geometry));
  });
});
