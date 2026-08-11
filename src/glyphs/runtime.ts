/**
 * Draft, background-independent glyph composition helpers.
 *
 * The functions in this module deliberately operate on caller-provided masks.
 * They do not load glyph artwork and do not imply that the reviewed assets are
 * runtime-ready.
 */

export const GLYPH_ACTIVATION_INTENSITY_CODES = [32, 48, 72, 96, 128, 164, 208, 255] as const;

export type GlyphActivationFrame = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RgbColor = readonly [red: number, green: number, blue: number];

export interface BinaryMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface RgbaSurface {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface GlyphAttachmentMasks {
  readonly inscriptionSupportMask: BinaryMask;
  readonly currentSolidMaterialMask: BinaryMask;
}

export interface GlyphCompositionInput extends GlyphAttachmentMasks {
  readonly surface: RgbaSurface;
  readonly glyphInkMask: BinaryMask;
  readonly foregroundOcclusionMask?: BinaryMask;
  readonly glyphColor: RgbColor;
  readonly activationFrame: GlyphActivationFrame;
}

export interface GlyphCompositionResult {
  /** The glyph shape that still has both its original support and solid matter. */
  readonly visibleGlyphMask: BinaryMask;
  /** The visible mask after temporary foreground cover is applied. */
  readonly renderedGlyphMask: BinaryMask;
  readonly pixels: Uint8ClampedArray;
  readonly activationIntensityCode: number;
  readonly frameColor: RgbColor;
}

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
};

const assertBinaryMask = (mask: BinaryMask, label: string): void => {
  assertPositiveInteger(mask.width, `${label}.width`);
  assertPositiveInteger(mask.height, `${label}.height`);
  if (mask.data.length !== mask.width * mask.height) {
    throw new RangeError(`${label}.data length does not match its dimensions`);
  }
  for (const value of mask.data) {
    if (value !== 0 && value !== 1) throw new RangeError(`${label}.data must contain only 0 or 1`);
  }
};

const assertSameDimensions = (reference: BinaryMask, candidate: BinaryMask, label: string): void => {
  if (candidate.width !== reference.width || candidate.height !== reference.height) {
    throw new RangeError(`${label} dimensions must match the glyph mask`);
  }
};

const assertSurface = (surface: RgbaSurface): void => {
  assertPositiveInteger(surface.width, "surface.width");
  assertPositiveInteger(surface.height, "surface.height");
  if (surface.pixels.length !== surface.width * surface.height * 4) {
    throw new RangeError("surface.pixels length does not match its dimensions");
  }
};

const assertColor = (color: RgbColor): void => {
  if (color.length !== 3) throw new RangeError("glyphColor must contain exactly 3 channels");
  for (const channel of color) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError("glyphColor channels must be integers from 0 to 255");
    }
  }
};

const assertOpaqueSolidSurface = (
  surface: RgbaSurface,
  currentSolidMaterialMask: BinaryMask,
): void => {
  for (let index = 0; index < currentSolidMaterialMask.data.length; index += 1) {
    if (currentSolidMaterialMask.data[index] === 0) continue;
    if (surface.pixels[index * 4 + 3] !== 255) {
      throw new RangeError(
        "surface alpha must be 255 wherever currentSolidMaterialMask is 1; translucent solid materials are unsupported",
      );
    }
  }
};

const copyMask = (mask: BinaryMask): BinaryMask => ({
  width: mask.width,
  height: mask.height,
  data: new Uint8Array(mask.data),
});

const assertAttachmentMasks = (masks: GlyphAttachmentMasks): void => {
  assertBinaryMask(masks.inscriptionSupportMask, "inscriptionSupportMask");
  assertBinaryMask(masks.currentSolidMaterialMask, "currentSolidMaterialMask");
  assertSameDimensions(
    masks.inscriptionSupportMask,
    masks.currentSolidMaterialMask,
    "currentSolidMaterialMask",
  );
};

/**
 * Implements the V-03 support formula without mutating any input plane.
 *
 * visible = glyph ink AND original inscription support AND current solid matter
 */
export const deriveVisibleGlyphMask = (
  glyphInkMask: BinaryMask,
  inscriptionSupportMask: BinaryMask,
  currentSolidMaterialMask: BinaryMask,
): BinaryMask => {
  assertBinaryMask(glyphInkMask, "glyphInkMask");
  assertBinaryMask(inscriptionSupportMask, "inscriptionSupportMask");
  assertBinaryMask(currentSolidMaterialMask, "currentSolidMaterialMask");
  assertSameDimensions(glyphInkMask, inscriptionSupportMask, "inscriptionSupportMask");
  assertSameDimensions(glyphInkMask, currentSolidMaterialMask, "currentSolidMaterialMask");

  const data = new Uint8Array(glyphInkMask.data.length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = glyphInkMask.data[index] & inscriptionSupportMask.data[index] & currentSolidMaterialMask.data[index];
  }
  return { width: glyphInkMask.width, height: glyphInkMask.height, data };
};

/** Applies temporary foreground cover while preserving inscription metadata. */
export const applyForegroundOcclusion = (
  visibleGlyphMask: BinaryMask,
  foregroundOcclusionMask?: BinaryMask,
): BinaryMask => {
  assertBinaryMask(visibleGlyphMask, "visibleGlyphMask");
  if (!foregroundOcclusionMask) return copyMask(visibleGlyphMask);

  assertBinaryMask(foregroundOcclusionMask, "foregroundOcclusionMask");
  assertSameDimensions(visibleGlyphMask, foregroundOcclusionMask, "foregroundOcclusionMask");
  const data = new Uint8Array(visibleGlyphMask.data.length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = visibleGlyphMask.data[index] & (foregroundOcclusionMask.data[index] ^ 1);
  }
  return { width: visibleGlyphMask.width, height: visibleGlyphMask.height, data };
};

export const getGlyphActivationIntensityCode = (frame: GlyphActivationFrame): number => {
  const code: number | undefined = GLYPH_ACTIVATION_INTENSITY_CODES[frame];
  if (code === undefined) throw new RangeError("activationFrame must be an integer from 0 to 7");
  return code;
};

const scaleColor = (color: RgbColor, intensityCode: number): RgbColor => [
  Math.round((color[0] * intensityCode) / 255),
  Math.round((color[1] * intensityCode) / 255),
  Math.round((color[2] * intensityCode) / 255),
];

/**
 * Composes one activation frame at integer pixel coordinates.
 *
 * All rendered glyph pixels receive the same activation multiplier. The glyph
 * silhouette, position, support and surface pixels never change between frames.
 */
export const composeGlyphFrame = (input: GlyphCompositionInput): GlyphCompositionResult => {
  assertSurface(input.surface);
  assertBinaryMask(input.glyphInkMask, "glyphInkMask");
  assertAttachmentMasks(input);
  assertSameDimensions(input.glyphInkMask, input.inscriptionSupportMask, "inscriptionSupportMask");
  assertSameDimensions(input.glyphInkMask, input.currentSolidMaterialMask, "currentSolidMaterialMask");
  if (input.surface.width !== input.glyphInkMask.width || input.surface.height !== input.glyphInkMask.height) {
    throw new RangeError("surface dimensions must match the glyph mask");
  }
  if (input.foregroundOcclusionMask) {
    assertBinaryMask(input.foregroundOcclusionMask, "foregroundOcclusionMask");
    assertSameDimensions(input.glyphInkMask, input.foregroundOcclusionMask, "foregroundOcclusionMask");
  }
  assertColor(input.glyphColor);
  assertOpaqueSolidSurface(input.surface, input.currentSolidMaterialMask);

  const activationIntensityCode = getGlyphActivationIntensityCode(input.activationFrame);
  const frameColor = scaleColor(input.glyphColor, activationIntensityCode);
  const visibleGlyphMask = deriveVisibleGlyphMask(
    input.glyphInkMask,
    input.inscriptionSupportMask,
    input.currentSolidMaterialMask,
  );
  const renderedGlyphMask = applyForegroundOcclusion(visibleGlyphMask, input.foregroundOcclusionMask);
  const pixels = new Uint8ClampedArray(input.surface.pixels);

  for (let index = 0; index < renderedGlyphMask.data.length; index += 1) {
    if (renderedGlyphMask.data[index] === 0) continue;
    const pixelOffset = index * 4;
    pixels[pixelOffset] = frameColor[0];
    pixels[pixelOffset + 1] = frameColor[1];
    pixels[pixelOffset + 2] = frameColor[2];
    // Solid surfaces are validated as fully opaque above, so alpha stays 255.
  }

  return { visibleGlyphMask, renderedGlyphMask, pixels, activationIntensityCode, frameColor };
};

/**
 * Permanently removes both matter and inscription support at destroyed pixels.
 * The returned planes are detached copies; the caller's state is unchanged.
 */
export const destroyInscribedMaterial = (
  masks: GlyphAttachmentMasks,
  destructionMask: BinaryMask,
): GlyphAttachmentMasks => {
  assertAttachmentMasks(masks);
  assertBinaryMask(destructionMask, "destructionMask");
  assertSameDimensions(masks.inscriptionSupportMask, destructionMask, "destructionMask");

  const support = new Uint8Array(masks.inscriptionSupportMask.data.length);
  const solid = new Uint8Array(masks.currentSolidMaterialMask.data.length);
  for (let index = 0; index < support.length; index += 1) {
    const survives = destructionMask.data[index] ^ 1;
    support[index] = masks.inscriptionSupportMask.data[index] & survives;
    solid[index] = masks.currentSolidMaterialMask.data[index] & survives;
  }
  return {
    inscriptionSupportMask: { width: destructionMask.width, height: destructionMask.height, data: support },
    currentSolidMaterialMask: { width: destructionMask.width, height: destructionMask.height, data: solid },
  };
};

/**
 * Adds new solid matter without copying the old inscription onto it.
 * A separate, explicit reinscription event would be needed to restore support.
 */
export const refillSolidMaterial = (
  masks: GlyphAttachmentMasks,
  refillMask: BinaryMask,
): GlyphAttachmentMasks => {
  assertAttachmentMasks(masks);
  assertBinaryMask(refillMask, "refillMask");
  assertSameDimensions(masks.inscriptionSupportMask, refillMask, "refillMask");

  const solid = new Uint8Array(masks.currentSolidMaterialMask.data.length);
  for (let index = 0; index < solid.length; index += 1) {
    solid[index] = masks.currentSolidMaterialMask.data[index] | refillMask.data[index];
  }
  return {
    inscriptionSupportMask: copyMask(masks.inscriptionSupportMask),
    currentSolidMaterialMask: { width: refillMask.width, height: refillMask.height, data: solid },
  };
};
