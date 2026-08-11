import { describe, expect, it } from "vitest";
import {
  GLYPH_ACTIVATION_INTENSITY_CODES,
  applyForegroundOcclusion,
  composeGlyphFrame,
  deriveVisibleGlyphMask,
  destroyInscribedMaterial,
  refillSolidMaterial,
  type BinaryMask,
  type GlyphActivationFrame,
  type RgbColor,
  type RgbaSurface,
} from "./runtime";

const mask = (width: number, height: number, values: readonly number[]): BinaryMask => ({
  width,
  height,
  data: Uint8Array.from(values),
});

const surface = (width: number, height: number, colors: readonly (readonly [number, number, number])[]): RgbaSurface => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  colors.forEach((color, index) => {
    pixels[index * 4] = color[0];
    pixels[index * 4 + 1] = color[1];
    pixels[index * 4 + 2] = color[2];
    pixels[index * 4 + 3] = 255;
  });
  return { width, height, pixels };
};

const pixelRgb = (pixels: Uint8ClampedArray, index: number): readonly number[] => [
  pixels[index * 4],
  pixels[index * 4 + 1],
  pixels[index * 4 + 2],
];

describe("background-independent glyph runtime", () => {
  it("derives the visible mask from ink, inscription support and current solid matter", () => {
    const visible = deriveVisibleGlyphMask(
      mask(3, 2, [1, 1, 1, 1, 0, 1]),
      mask(3, 2, [1, 0, 1, 1, 1, 1]),
      mask(3, 2, [1, 1, 0, 1, 1, 1]),
    );

    expect([...visible.data]).toEqual([1, 0, 0, 1, 0, 1]);
  });

  it("uses the same silhouette for all eight uniformly brightening frames", () => {
    const background = surface(3, 1, [[9, 10, 11], [20, 21, 22], [30, 31, 32]]);
    const glyphInkMask = mask(3, 1, [1, 0, 1]);
    const support = mask(3, 1, [1, 1, 1]);
    const solid = mask(3, 1, [1, 1, 1]);
    const seenColors: number[][] = [];

    for (let frame = 0; frame < 8; frame += 1) {
      const result = composeGlyphFrame({
        surface: background,
        glyphInkMask,
        inscriptionSupportMask: support,
        currentSolidMaterialMask: solid,
        glyphColor: [240, 120, 60],
        activationFrame: frame as GlyphActivationFrame,
      });

      const code = GLYPH_ACTIVATION_INTENSITY_CODES[frame];
      const expected = [240, 120, 60].map((channel) => Math.round((channel * code) / 255));
      expect([...result.visibleGlyphMask.data]).toEqual([1, 0, 1]);
      expect([...result.renderedGlyphMask.data]).toEqual([1, 0, 1]);
      expect(pixelRgb(result.pixels, 0)).toEqual(expected);
      expect(pixelRgb(result.pixels, 2)).toEqual(expected);
      expect(pixelRgb(result.pixels, 1)).toEqual([20, 21, 22]);
      seenColors.push(expected);
    }

    for (let frame = 1; frame < seenColors.length; frame += 1) {
      expect(seenColors[frame][0]).toBeGreaterThan(seenColors[frame - 1][0]);
      expect(seenColors[frame][1]).toBeGreaterThan(seenColors[frame - 1][1]);
      expect(seenColors[frame][2]).toBeGreaterThan(seenColors[frame - 1][2]);
    }
  });

  it("keeps background surfaces separate from the synthetic transparent glyph mask", () => {
    const glyphInkMask = mask(2, 1, [1, 0]);
    const support = mask(2, 1, [1, 1]);
    const solid = mask(2, 1, [1, 1]);
    const stone = surface(2, 1, [[18, 19, 20], [38, 39, 40]]);
    const wood = surface(2, 1, [[42, 24, 12], [90, 55, 30]]);

    const stoneResult = composeGlyphFrame({
      surface: stone,
      glyphInkMask,
      inscriptionSupportMask: support,
      currentSolidMaterialMask: solid,
      glyphColor: [180, 220, 255],
      activationFrame: 7,
    });
    const woodResult = composeGlyphFrame({
      surface: wood,
      glyphInkMask,
      inscriptionSupportMask: support,
      currentSolidMaterialMask: solid,
      glyphColor: [180, 220, 255],
      activationFrame: 7,
    });

    expect(pixelRgb(stoneResult.pixels, 0)).toEqual([180, 220, 255]);
    expect(pixelRgb(woodResult.pixels, 0)).toEqual([180, 220, 255]);
    expect(pixelRgb(stoneResult.pixels, 1)).toEqual([38, 39, 40]);
    expect(pixelRgb(woodResult.pixels, 1)).toEqual([90, 55, 30]);
  });

  it("does not resurrect a destroyed inscription when solid material is refilled", () => {
    const glyphInkMask = mask(3, 1, [1, 1, 1]);
    const original = {
      inscriptionSupportMask: mask(3, 1, [1, 1, 1]),
      currentSolidMaterialMask: mask(3, 1, [1, 1, 1]),
    };
    const destroyed = destroyInscribedMaterial(original, mask(3, 1, [0, 1, 0]));
    const refilled = refillSolidMaterial(destroyed, mask(3, 1, [0, 1, 0]));

    expect([...destroyed.inscriptionSupportMask.data]).toEqual([1, 0, 1]);
    expect([...destroyed.currentSolidMaterialMask.data]).toEqual([1, 0, 1]);
    expect([...refilled.inscriptionSupportMask.data]).toEqual([1, 0, 1]);
    expect([...refilled.currentSolidMaterialMask.data]).toEqual([1, 1, 1]);
    expect([
      ...deriveVisibleGlyphMask(
        glyphInkMask,
        refilled.inscriptionSupportMask,
        refilled.currentSolidMaterialMask,
      ).data,
    ]).toEqual([1, 0, 1]);
    expect([...original.inscriptionSupportMask.data]).toEqual([1, 1, 1]);
    expect([...original.currentSolidMaterialMask.data]).toEqual([1, 1, 1]);
  });

  it("treats foreground occlusion as reversible cover rather than support destruction", () => {
    const visible = mask(3, 1, [1, 1, 1]);
    const occlusion = mask(3, 1, [0, 1, 0]);

    expect([...applyForegroundOcclusion(visible, occlusion).data]).toEqual([1, 0, 1]);
    expect([...applyForegroundOcclusion(visible).data]).toEqual([1, 1, 1]);
    expect([...visible.data]).toEqual([1, 1, 1]);
  });

  it("does not mutate surface pixels or any input mask while composing", () => {
    const background = surface(2, 1, [[5, 6, 7], [8, 9, 10]]);
    const originalPixels = [...background.pixels];
    const glyphInkMask = mask(2, 1, [1, 1]);
    const support = mask(2, 1, [1, 1]);
    const solid = mask(2, 1, [1, 0]);

    const result = composeGlyphFrame({
      surface: background,
      glyphInkMask,
      inscriptionSupportMask: support,
      currentSolidMaterialMask: solid,
      glyphColor: [255, 128, 64],
      activationFrame: 7,
    });

    expect(result.pixels).not.toBe(background.pixels);
    expect([...background.pixels]).toEqual(originalPixels);
    expect([...glyphInkMask.data]).toEqual([1, 1]);
    expect([...support.data]).toEqual([1, 1]);
    expect([...solid.data]).toEqual([1, 0]);
  });

  it("rejects antialiased masks, mismatched planes and frames outside the eight-frame contract", () => {
    expect(() => deriveVisibleGlyphMask(
      mask(1, 1, [128]),
      mask(1, 1, [1]),
      mask(1, 1, [1]),
    )).toThrow(/0 or 1/);
    expect(() => deriveVisibleGlyphMask(
      mask(2, 1, [1, 1]),
      mask(1, 1, [1]),
      mask(2, 1, [1, 1]),
    )).toThrow(/dimensions/);
    expect(() => composeGlyphFrame({
      surface: surface(1, 1, [[0, 0, 0]]),
      glyphInkMask: mask(1, 1, [1]),
      inscriptionSupportMask: mask(1, 1, [1]),
      currentSolidMaterialMask: mask(1, 1, [1]),
      glyphColor: [255, 255, 255],
      activationFrame: 8 as GlyphActivationFrame,
    })).toThrow(/0 to 7/);
  });

  it("rejects runtime colors that do not contain exactly three channels", () => {
    const base = {
      surface: surface(1, 1, [[0, 0, 0]]),
      glyphInkMask: mask(1, 1, [1]),
      inscriptionSupportMask: mask(1, 1, [1]),
      currentSolidMaterialMask: mask(1, 1, [1]),
      activationFrame: 7 as const,
    };

    expect(() => composeGlyphFrame({
      ...base,
      glyphColor: [255, 128] as unknown as RgbColor,
    })).toThrow(/exactly 3 channels/);
    expect(() => composeGlyphFrame({
      ...base,
      glyphColor: [255, 128, 64, 32] as unknown as RgbColor,
    })).toThrow(/exactly 3 channels/);
  });

  it.each([0, 128])("rejects alpha %i on a solid material pixel", (alpha) => {
    const background = surface(2, 1, [[10, 11, 12], [20, 21, 22]]);
    background.pixels[3] = alpha;

    expect(() => composeGlyphFrame({
      surface: background,
      glyphInkMask: mask(2, 1, [1, 0]),
      inscriptionSupportMask: mask(2, 1, [1, 1]),
      currentSolidMaterialMask: mask(2, 1, [1, 0]),
      glyphColor: [255, 128, 64],
      activationFrame: 7,
    })).toThrow(/alpha must be 255/);
  });
});
