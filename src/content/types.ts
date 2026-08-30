export type ContentScalar = string | number | boolean | null;

export type ContentValue =
  | ContentScalar
  | readonly ContentValue[]
  | { readonly [key: string]: ContentValue };

export interface ContentObject {
  readonly [key: string]: ContentValue;
}

export interface ContentSource {
  /** Repository-relative POSIX path, for example data/spells/foo.v0.1.yaml. */
  readonly path: string;
  readonly data: unknown;
}

export type ContentKind =
  | "attack_signatures"
  | "chapter"
  | "dialogue_audio"
  | "ecology"
  | "forest_opening"
  | "glyph_catalog"
  | "glyph_progression"
  | "learning_progression"
  | "learning_corpus"
  | "length_profiles"
  | "p0_curriculum"
  | "persistence"
  | "region"
  | "scene"
  | "settlement_trade"
  | "single_word_spells"
  | "survival"
  | "task"
  | "visual_surface_profiles"
  | "wildlife_economy";

export interface CompiledSource<T extends ContentObject = ContentObject> {
  readonly path: string;
  readonly kind: ContentKind;
  readonly schemaVersion: string;
  readonly contentVersion: string;
  /** The validated source object. Numeric gameplay values stay here, as authored. */
  readonly content: T;
}

export interface ContentManifest {
  readonly schemaVersion: "tokipona.content-manifest.v0.1";
  readonly sources: Readonly<Record<string, CompiledSource>>;
  readonly byKind: Readonly<Record<ContentKind, readonly CompiledSource[]>>;
  readonly indexes: {
    readonly words: Readonly<Record<string, ContentObject>>;
    readonly lengthElements: Readonly<Record<string, ContentObject>>;
    readonly attackGraphs: Readonly<Record<string, ContentObject>>;
    readonly attackSignatures: Readonly<Record<string, ContentObject>>;
    readonly chapters: Readonly<Record<string, ContentObject>>;
    readonly regions: Readonly<Record<string, ContentObject>>;
    readonly scenes: Readonly<Record<string, ContentObject>>;
    readonly ecologies: Readonly<Record<string, ContentObject>>;
    readonly economies: Readonly<Record<string, ContentObject>>;
    readonly persistenceCoordinators: Readonly<Record<string, ContentObject>>;
    readonly tasks: Readonly<Record<string, ContentObject>>;
    readonly p0Words: Readonly<Record<string, ContentObject>>;
    readonly glyphs: Readonly<Record<string, ContentObject>>;
  };
}

export interface ContentIssue {
  readonly code: string;
  readonly sourcePath: string;
  readonly fieldPath: string;
  readonly message: string;
}

export interface SerializableManifestIndex {
  readonly schemaVersion: "tokipona.content-index.v0.1";
  readonly sources: ReadonlyArray<{
    readonly path: string;
    readonly kind: ContentKind;
    readonly schemaVersion: string;
    readonly contentVersion: string;
  }>;
  readonly ids: {
    readonly words: readonly string[];
    readonly lengthElements: readonly string[];
    readonly attackGraphs: readonly string[];
    readonly attackSignatures: readonly string[];
    readonly chapters: readonly string[];
    readonly regions: readonly string[];
    readonly scenes: readonly string[];
    readonly ecologies: readonly string[];
    readonly economies: readonly string[];
    readonly persistenceCoordinators: readonly string[];
    readonly tasks: readonly string[];
    readonly p0Words: readonly string[];
    readonly glyphs: readonly string[];
  };
}
