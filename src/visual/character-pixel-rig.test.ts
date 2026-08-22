import { describe, expect, it } from "vitest";
import type { ProjectedPrototypeCharacter, PrototypeCharacterAnimation } from "./world-scale-prototype";
import { projectCharacterPixels } from "./character-pixel-rig";

describe("temporary character pixel rig", () => {
  it.each(["idle", "run", "rise", "fall", "land"] as const)(
    "projects a readable 14x19 %s sprite over the unchanged collision body",
    (animation) => {
      const source = character(animation, 12, "right");
      const rig = projectCharacterPixels(source);

      expect(rig.visualBounds).toEqual({ width: 14, height: 19 });
      expect(rig.anchorOffset).toEqual({ x: -1, y: -5 });
      expect(rig.collisionBody).toEqual({ width: 12, height: 14 });
      expect(rig.pixels.length).toBeGreaterThan(8);
      expect(rig.pixels.every((pixel) => pixel.x >= 0 && pixel.y >= 0)).toBe(true);
      expect(rig.pixels.every((pixel) => pixel.x + pixel.width <= 14 && pixel.y + pixel.height <= 19)).toBe(true);
      expect(Object.isFrozen(rig)).toBe(true);
      expect(source.worldBody).toEqual({ width: 12, height: 14 });
    },
  );

  it("uses four distinct run phases derived from the runtime tick", () => {
    const phases = [0, 3, 6, 9].map((tick) => projectCharacterPixels(character("run", tick, "right")));

    expect(phases.map((rig) => rig.animationFrame)).toEqual([0, 1, 2, 3]);
    expect(new Set(phases.map((rig) => JSON.stringify(rig.pixels))).size).toBe(4);
  });

  it("mirrors the face and limbs when facing left", () => {
    const right = projectCharacterPixels(character("run", 3, "right"));
    const left = projectCharacterPixels(character("run", 3, "left"));
    const rightEye = right.pixels.find((pixel) => pixel.role === "eye")!;
    const leftEye = left.pixels.find((pixel) => pixel.role === "eye")!;

    expect(leftEye.x).toBe(14 - rightEye.x - rightEye.width);
    expect(left.pixels).not.toEqual(right.pixels);
  });

  it("emits dust anchors only for the landing pose", () => {
    expect(projectCharacterPixels(character("land", 1, "right")).landingDustAnchors).toHaveLength(2);
    for (const animation of ["idle", "run", "rise", "fall"] as const) {
      expect(projectCharacterPixels(character(animation, 1, "right")).landingDustAnchors).toEqual([]);
    }
  });
});

function character(
  animation: PrototypeCharacterAnimation,
  tick: number,
  facing: "left" | "right",
): ProjectedPrototypeCharacter {
  return {
    animation,
    facing,
    grounded: animation === "idle" || animation === "run" || animation === "land",
    gaitFrame: (Math.floor(tick / 6) % 2) as 0 | 1,
    tick,
    worldPosition: { x: 80, y: 100 },
    screenPosition: { x: 80, y: 100 },
    worldBody: { width: 12, height: 14 },
  };
}
