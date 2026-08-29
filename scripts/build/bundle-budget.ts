export const EXPECTED_BUILD_ENTRIES = Object.freeze([
  "index.html",
  "survival.html",
  "trade.html",
  "cistern.html",
  "rpg.html",
  "world-scale.html",
] as const);

export const BUNDLE_BUDGETS = Object.freeze({
  maximumChunkBytes: 320 * 1024,
  maximumRpgShellBytes: 64 * 1024,
  maximumRpgInitialBytes: 1_100 * 1024,
  maximumRpgInitialRequests: 18,
});

const REQUIRED_RPG_CHUNK_NAMES = Object.freeze([
  "content-runtime.v0.1",
  "app-support~rpg",
  "game-runtime~rpg",
  "session-runtime~rpg",
  "rpg-ui~rpg",
  "learning-runtime~rpg",
]);

const FORBIDDEN_WORLD_SCALE_DOMAIN_CHUNK_NAMES = Object.freeze([
  "game-runtime~rpg",
  "session-runtime~rpg",
  "rpg-ui~rpg",
  "learning-runtime~rpg",
]);

interface ManifestChunk {
  readonly file: string;
  readonly name: string | null;
  readonly isEntry: boolean;
  readonly imports: readonly string[];
  readonly css: readonly string[];
}

export interface BundleEntryBudget {
  readonly entry: string;
  readonly entryBytes: number;
  readonly initialJsBytes: number;
  readonly initialJsRequests: number;
}

export interface BundleBudgetReport {
  readonly schemaVersion: "tokipona.bundle-budget-report.v0.1";
  readonly status: "pass";
  readonly maximumChunkBytes: number;
  readonly largestChunk: Readonly<{ file: string; bytes: number }>;
  readonly entries: readonly BundleEntryBudget[];
}

export function assertBundleBudget(
  candidate: unknown,
  sizeOf: (relativePath: string) => number,
): BundleBudgetReport {
  const manifest = parseManifest(candidate);
  const entryKeys = [...manifest.entries()].filter(([, chunk]) => chunk.isEntry).map(([key]) => key).sort();
  assert(equalStrings(entryKeys, [...EXPECTED_BUILD_ENTRIES].sort()), "bundle_entry_set_invalid");

  const fileSizes = new Map<string, number>();
  for (const chunk of manifest.values()) {
    measure(chunk.file, sizeOf, fileSizes);
    for (const css of chunk.css) measure(css, sizeOf, fileSizes);
  }
  for (const [key, chunk] of manifest) {
    for (const importedKey of chunk.imports) {
      const importedChunk = manifest.get(importedKey);
      assert(importedChunk !== undefined, `bundle_import_missing:${key}:${importedKey}`);
      assert(chunk.isEntry || !importedChunk.isEntry, `bundle_entry_reverse_import:${key}:${importedKey}`);
    }
  }

  const jsChunks = [...fileSizes].filter(([file]) => file.endsWith(".js"));
  assert(jsChunks.length > 0, "bundle_js_missing");
  const largestChunk = jsChunks.reduce((largest, current) => current[1] > largest[1] ? current : largest);
  assert(largestChunk[1] <= BUNDLE_BUDGETS.maximumChunkBytes,
    `bundle_chunk_budget_exceeded:${largestChunk[0]}:${largestChunk[1]}`);

  const entries = EXPECTED_BUILD_ENTRIES.map((entry) => {
    const closure = staticClosure(entry, manifest);
    const entryChunk = required(manifest.get(entry), `bundle_entry_missing:${entry}`);
    const entryBytes = required(fileSizes.get(entryChunk.file), `bundle_file_unmeasured:${entryChunk.file}`);
    const initialJsFiles = [...closure]
      .map((key) => required(manifest.get(key), `bundle_chunk_missing:${key}`).file)
      .filter((file) => file.endsWith(".js"));
    const initialJsBytes = initialJsFiles.reduce((sum, file) =>
      sum + required(fileSizes.get(file), `bundle_file_unmeasured:${file}`), 0);
    return Object.freeze({
      entry,
      entryBytes,
      initialJsBytes,
      initialJsRequests: initialJsFiles.length,
    });
  });

  const rpg = required(entries.find((entry) => entry.entry === "rpg.html"), "bundle_rpg_entry_missing");
  assert(rpg.entryBytes <= BUNDLE_BUDGETS.maximumRpgShellBytes,
    `bundle_rpg_shell_budget_exceeded:${rpg.entryBytes}`);
  assert(rpg.initialJsBytes <= BUNDLE_BUDGETS.maximumRpgInitialBytes,
    `bundle_rpg_initial_budget_exceeded:${rpg.initialJsBytes}`);
  assert(rpg.initialJsRequests <= BUNDLE_BUDGETS.maximumRpgInitialRequests,
    `bundle_rpg_request_budget_exceeded:${rpg.initialJsRequests}`);

  const rpgNames = new Set([...staticClosure("rpg.html", manifest)]
    .map((key) => required(manifest.get(key), `bundle_chunk_missing:${key}`).name)
    .filter((name): name is string => name !== null));
  for (const requiredName of REQUIRED_RPG_CHUNK_NAMES) {
    assert(rpgNames.has(requiredName), `bundle_rpg_domain_chunk_missing:${requiredName}`);
  }

  const worldScaleNames = new Set([...staticClosure("world-scale.html", manifest)]
    .map((key) => required(manifest.get(key), `bundle_chunk_missing:${key}`).name)
    .filter((name): name is string => name !== null));
  for (const forbiddenName of FORBIDDEN_WORLD_SCALE_DOMAIN_CHUNK_NAMES) {
    assert(!worldScaleNames.has(forbiddenName), `bundle_world_scale_domain_dependency:${forbiddenName}`);
  }

  return Object.freeze({
    schemaVersion: "tokipona.bundle-budget-report.v0.1",
    status: "pass",
    maximumChunkBytes: BUNDLE_BUDGETS.maximumChunkBytes,
    largestChunk: Object.freeze({ file: largestChunk[0], bytes: largestChunk[1] }),
    entries: Object.freeze(entries),
  });
}

function parseManifest(candidate: unknown): ReadonlyMap<string, ManifestChunk> {
  const source = record(candidate, "bundle_manifest_invalid");
  const manifest = new Map<string, ManifestChunk>();
  const files = new Set<string>();
  for (const [key, value] of Object.entries(source)) {
    const raw = record(value, `bundle_chunk_invalid:${key}`);
    const file = relativeFile(raw.file, `bundle_chunk_file_invalid:${key}`);
    assert(!files.has(file), `bundle_chunk_file_duplicate:${file}`);
    files.add(file);
    manifest.set(key, Object.freeze({
      file,
      name: raw.name === undefined ? null : string(raw.name, `bundle_chunk_name_invalid:${key}`),
      isEntry: raw.isEntry === true,
      imports: Object.freeze(strings(raw.imports ?? [], `bundle_chunk_imports_invalid:${key}`)),
      css: Object.freeze(strings(raw.css ?? [], `bundle_chunk_css_invalid:${key}`)
        .map((path) => relativeFile(path, `bundle_css_file_invalid:${key}`))),
    }));
  }
  return manifest;
}

function staticClosure(root: string, manifest: ReadonlyMap<string, ManifestChunk>): ReadonlySet<string> {
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = required(manifest.get(key), `bundle_chunk_missing:${key}`);
    for (const importedKey of chunk.imports) visit(importedKey);
  };
  visit(root);
  return visited;
}

function measure(file: string, sizeOf: (relativePath: string) => number, sizes: Map<string, number>): void {
  if (sizes.has(file)) return;
  let bytes: number;
  try {
    bytes = sizeOf(file);
  } catch {
    throw new Error(`bundle_file_missing:${file}`);
  }
  assert(Number.isSafeInteger(bytes) && bytes > 0, `bundle_file_size_invalid:${file}`);
  sizes.set(file, bytes);
}

function relativeFile(value: unknown, reason: string): string {
  const file = string(value, reason);
  assert(file.length > 0 && !file.includes("\\") && !file.startsWith("/") && !file.includes(":") &&
    file.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), reason);
  return file;
}

function strings(value: unknown, reason: string): string[] {
  assert(Array.isArray(value) && value.every((entry) => typeof entry === "string"), reason);
  return [...value];
}

function string(value: unknown, reason: string): string {
  assert(typeof value === "string" && value.length > 0, reason);
  return value;
}

function record(value: unknown, reason: string): Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), reason);
  return value as Record<string, unknown>;
}

function required<T>(value: T | undefined, reason: string): T {
  if (value === undefined) throw new Error(reason);
  return value;
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
