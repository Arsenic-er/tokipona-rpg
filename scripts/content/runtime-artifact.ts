import { createHash } from "node:crypto";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";

export const RUNTIME_CONTENT_SCHEMA_VERSION = "tokipona.runtime-content.v0.1" as const;
export const RUNTIME_CONTENT_OUTPUT_PATH = "src/generated/content-runtime.v0.1.json" as const;

export type RuntimeTeloLengthClass = "short" | "default" | "long";

export interface RuntimeTeloLengthProfile {
  readonly profileVersion: string;
  readonly nominalLengthPx: number;
  readonly minimumRealizedLengthPx: number;
  readonly activationMp: number;
  readonly crossSectionWidthPx: number;
}

export interface RuntimeContentArtifact {
  readonly schemaVersion: typeof RUNTIME_CONTENT_SCHEMA_VERSION;
  readonly sourceDigest: `sha256:${string}`;
  readonly source: {
    readonly path: string;
    readonly schemaVersion: string;
    readonly contentVersion: string;
  };
  readonly telo: {
    readonly pixelsPerTile: number;
    readonly profiles: Readonly<Record<RuntimeTeloLengthClass, RuntimeTeloLengthProfile>>;
  };
}

export function buildRuntimeContentArtifact(manifest: ContentManifest): RuntimeContentArtifact {
  const lengthSources = manifest.byKind.length_profiles;
  if (lengthSources.length !== 1) {
    throw new Error(`Expected exactly one validated length profile source, received ${lengthSources.length}.`);
  }
  const source = lengthSources[0];
  if (!source) throw new Error("Validated length profile source is unavailable.");

  const content = source.content;
  const pixelsPerTile = requirePositiveNumber(content, ["world_units", "pixels_per_tile"]);
  const lengthClasses = requireObject(content, ["length_classes"]);
  const telo = requireObject(content, ["element_profiles", "word.telo"]);
  const baseLengthTiles = requirePositiveNumber(telo, ["base_length_tiles"]);
  const crossSectionWidthPx = requirePositiveNumber(telo, ["cross_section_width_px"]);
  const expectedActivationMp = requireObject(telo, ["expected_activation_mp"]);
  const lengthTileFields: Readonly<Record<RuntimeTeloLengthClass, string>> = {
    short: "short_length_tiles",
    default: "base_length_tiles",
    long: "long_length_tiles",
  };

  const profiles = Object.fromEntries(
    (["short", "default", "long"] as const).map((lengthClass) => {
      const nominalLengthTiles = requirePositiveNumber(telo, [lengthTileFields[lengthClass]]);
      const classContract = requireObject(lengthClasses, [lengthClass]);
      const minimumRatio = requirePositiveNumber(classContract, ["minimum_realized_ratio_to_base"]);
      const activationMp = requireNonNegativeNumber(expectedActivationMp, [lengthClass]);
      return [
        lengthClass,
        {
          profileVersion: source.schemaVersion,
          nominalLengthPx: exactProduct(nominalLengthTiles, pixelsPerTile, `${lengthClass}.nominalLengthPx`),
          minimumRealizedLengthPx: exactProduct(
            baseLengthTiles,
            pixelsPerTile,
            minimumRatio,
            `${lengthClass}.minimumRealizedLengthPx`,
          ),
          activationMp,
          crossSectionWidthPx,
        },
      ];
    }),
  ) as unknown as Record<RuntimeTeloLengthClass, RuntimeTeloLengthProfile>;

  return {
    schemaVersion: RUNTIME_CONTENT_SCHEMA_VERSION,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(content)).digest("hex")}`,
    source: {
      path: source.path,
      schemaVersion: source.schemaVersion,
      contentVersion: source.contentVersion,
    },
    telo: { pixelsPerTile, profiles },
  };
}

export function serializeRuntimeContentArtifact(artifact: RuntimeContentArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function assertRuntimeArtifactCurrent(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `Generated runtime content is stale. Run the content runtime generator to refresh ${RUNTIME_CONTENT_OUTPUT_PATH}.`,
    );
  }
}

function stableStringify(value: ContentValue): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] as ContentValue)}`)
    .join(",")}}`;
}

function exactProduct(...valuesAndLabel: readonly (number | string)[]): number {
  const label = valuesAndLabel.at(-1);
  const values = valuesAndLabel.slice(0, -1) as number[];
  const result = values.reduce((product, value) => product * value, 1);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${String(label)} must resolve to an integer number of logical pixels, received ${result}.`);
  }
  return result;
}

function requireObject(root: ContentObject, path: readonly string[]): ContentObject {
  const value = readPath(root, path);
  if (!isContentObject(value)) throw new Error(`${path.join(".")} must be an object.`);
  return value;
}

function requirePositiveNumber(root: ContentObject, path: readonly string[]): number {
  const value = readPath(root, path);
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path.join(".")} must be a finite positive number.`);
  }
  return value;
}

function requireNonNegativeNumber(root: ContentObject, path: readonly string[]): number {
  const value = readPath(root, path);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path.join(".")} must be a finite non-negative number.`);
  }
  return value;
}

function readPath(root: ContentObject, path: readonly string[]): ContentValue | undefined {
  let value: ContentValue | undefined = root;
  for (const key of path) {
    if (!isContentObject(value)) return undefined;
    value = value[key];
  }
  return value;
}

function isContentObject(value: ContentValue | undefined): value is ContentObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
