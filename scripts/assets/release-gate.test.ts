import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  auditAssetRelease,
  exportApprovedAssetRelease,
  PUBLIC_RUNTIME_ROOT,
  serializePublicAudit,
} from "./release-gate";

interface FixtureOptions {
  readonly runtimeReady?: boolean;
  readonly publicExport?: boolean;
  readonly missingApproval?: string;
  readonly source?: string;
  readonly target?: string;
  readonly role?: string;
  readonly declaredHash?: string;
  readonly licenseApproved?: boolean;
  readonly licenseText?: string;
  readonly declaredLicenseHash?: string;
  readonly destinationRoot?: string;
  readonly destination?: string;
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("asset release gate", () => {
  it("rejects the current draft shape without copying anything", () => {
    const fixture = createFixture({ runtimeReady: false, publicExport: false });
    const result = audit(fixture);

    expect(result.decision).toBe("deny");
    expect(reasonCodes(result)).toEqual(
      expect.arrayContaining(["runtime_not_ready", "public_export_missing", "release_status_not_approved"]),
    );
    expect(readPublicFiles(fixture.publicRoot)).toEqual([]);
  });

  it("requires every source, license, language, pixel, animation, accessibility, community and hash approval", () => {
    const fixture = createFixture({ missingApproval: "community" });
    const result = audit(fixture);

    expect(result.decision).toBe("deny");
    expect(reasonCodes(result)).toContain("community_approval_missing");
  });

  it("rejects source and target path traversal", () => {
    const sourceEscape = createFixture({ source: "../secret.png" });
    const targetEscape = createFixture({ target: "../escaped.png" });

    expect(reasonCodes(audit(sourceEscape))).toContain("runtime_path_traversal");
    expect(reasonCodes(audit(targetEscape))).toContain("runtime_path_traversal");
  });

  it("rejects an incorrect runtime hash", () => {
    const fixture = createFixture({ declaredHash: "0".repeat(64) });

    expect(reasonCodes(audit(fixture))).toContain("runtime_file_hash_mismatch");
  });

  it("rejects fonts, review images and engineering files even when called runtime", () => {
    const font = createFixture({ source: "runtime/glyph.ttf", target: "glyph.ttf" });
    const review = createFixture({ source: "review/contact-sheet.png", target: "atlas.png" });

    expect(reasonCodes(audit(font))).toContain("runtime_extension_forbidden");
    expect(reasonCodes(audit(review))).toContain("private_asset_class_forbidden");
  });

  it("independently rejects a pending license record", () => {
    const fixture = createFixture({ licenseApproved: false });
    const result = audit(fixture);

    expect(result.decision).toBe("deny");
    expect(reasonCodes(result)).toEqual(
      expect.arrayContaining(["license_status_not_approved", "license_source_unverified", "license_redistribution_not_approved"]),
    );
  });

  it("uses canonical LF bytes for text license evidence across checkout platforms", () => {
    const fixture = createFixture({
      licenseText: "license\r\nevidence\r\n",
      declaredLicenseHash: sha256("license\nevidence\n"),
    });

    expect(audit(fixture).decision).toBe("allow");
  });

  it("dry-runs an approved release without writing files", () => {
    const fixture = createFixture();
    const result = exportApprovedAssetRelease({ ...fixture.options, dryRun: true });

    expect(result.audit.decision).toBe("allow");
    expect(result.dryRun).toBe(true);
    expect(result.exported).toBe(false);
    expect(result.publicDestination).toBe(`${PUBLIC_RUNTIME_ROOT}/test-glyph/v1`);
    expect(readPublicFiles(fixture.publicRoot)).toEqual([]);
  });

  it("atomically exports only the allowlisted runtime files", () => {
    const fixture = createFixture();
    const result = exportApprovedAssetRelease(fixture.options);

    expect(result.audit.decision).toBe("allow");
    expect(result.exported).toBe(true);
    expect(
      readFileSync(
        join(fixture.publicRoot, PUBLIC_RUNTIME_ROOT, "test-glyph", "v1", "atlas.png"),
        "utf8",
      ),
    ).toBe("runtime-atlas");
    expect(readPublicFiles(fixture.publicRoot)).toEqual([
      `${PUBLIC_RUNTIME_ROOT}/test-glyph/v1/atlas.png`,
    ]);
  });

  it("rejects the retired pronunciation root and audio role", () => {
    const retiredRole = createFixture({
      source: "runtime/telo.ogg",
      target: "telo.ogg",
      role: "pronunciation_audio",
    });
    const retiredRoot = createFixture({ destinationRoot: "pronunciation", destination: "." });
    const unknownRoot = createFixture({ destinationRoot: "arbitrary_public_path" });

    expect(reasonCodes(audit(retiredRole))).toContain("runtime_file_entry_invalid");
    expect(reasonCodes(audit(retiredRoot))).toContain("destination_root_invalid");
    expect(reasonCodes(audit(unknownRoot))).toContain("destination_root_invalid");
  });

  it("allows the exact approved forest runtime roles under the forest visual root", () => {
    expect(auditAssetRelease(approvedForestFixture()).decision).toBe("allow");
  });

  it("rejects forest review media even when it is declared as a runtime layer", () => {
    expect(auditAssetRelease(forestFixtureWithReviewPng()).decision).toBe("deny");
  });

  it("rejects forest candidate, private, and concept files", () => {
    for (const filename of ["candidate-layer.png", "private-layer.png", "concept-layer.png"]) {
      expect(auditAssetRelease(approvedForestFixture({ forbiddenFilename: filename })).decision)
        .toBe("deny");
    }
  });

  it("rejects candidate, private, and concept markers in every forest path segment", () => {
    for (const forbiddenPath of [
      { source: "candidate/background.png", target: "background.png" },
      { source: "runtime/background.png", target: "private/background.png" },
      { source: "concept/background.png", target: "background.png" },
    ]) {
      expect(auditAssetRelease(approvedForestFixture({ forbiddenPath })).decision).toBe("deny");
    }
  });

  it("serializes a public audit without leaking repository or private file paths", () => {
    const fixture = createFixture({ runtimeReady: false, publicExport: false });
    const serialized = serializePublicAudit(audit(fixture));

    expect(serialized).not.toContain(fixture.assetRoot);
    expect(serialized).not.toContain(fixture.publicRoot);
    expect(serialized).not.toContain("manifests/draft.yaml");
  });
});

function createFixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "tokipona-release-gate-"));
  temporaryRoots.push(root);
  const assetRoot = join(root, "asset-private");
  const publicRoot = join(root, "game-public");
  mkdirSync(join(assetRoot, "manifests"), { recursive: true });
  mkdirSync(join(assetRoot, "runtime"), { recursive: true });
  mkdirSync(join(assetRoot, "records"), { recursive: true });
  mkdirSync(join(assetRoot, "provenance"), { recursive: true });
  mkdirSync(publicRoot, { recursive: true });

  const source = options.source ?? "runtime/atlas.png";
  const releaseFiles = [{
    source,
    target: options.target ?? "atlas.png",
    role: options.role ?? "runtime_atlas",
    sha256: options.declaredHash ?? sha256("runtime-atlas"),
    content: "runtime-atlas",
  }];
  for (const file of releaseFiles) {
    if (file.source.includes("..")) continue;
    const absoluteSource = join(assetRoot, ...file.source.split("/"));
    mkdirSync(join(absoluteSource, ".."), { recursive: true });
    writeFileSync(absoluteSource, file.content);
  }

  const licenseText = join(assetRoot, "provenance", "OFL.txt");
  const fontEvidence = join(assetRoot, "provenance", "font.bin");
  writeFileSync(licenseText, options.licenseText ?? "license-evidence");
  writeFileSync(fontEvidence, "font-evidence");
  writeFileSync(
    join(assetRoot, "records", "license.yaml"),
    stringify({
      status: options.licenseApproved === false ? "license_file_present" : "approved",
      source_url: options.licenseApproved === false ? "" : "https://example.invalid/upstream",
      source_url_status: options.licenseApproved === false ? "pending" : "verified",
      redistribution_status: options.licenseApproved === false ? "pending_source_record" : "approved",
      license_spdx: "OFL-1.1",
      files: {
        font: { path: "provenance/font.bin", sha256: sha256("font-evidence") },
        license: { path: "provenance/OFL.txt", sha256: options.declaredLicenseHash ?? sha256("license-evidence") },
      },
    }),
  );

  const approvals = Object.fromEntries(
    ["source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes"].map(
      (approval) => [approval, approval === options.missingApproval ? "pending" : "approved"],
    ),
  );
  const publicExport = options.publicExport === false
    ? null
    : {
        release_status: "approved",
        ...(options.destinationRoot === undefined ? {} : { destination_root: options.destinationRoot }),
        destination: options.destination ?? "test-glyph/v1",
        license_record: "records/license.yaml",
        approvals,
        files: releaseFiles.map(({ content: _content, ...file }) => file),
      };
  writeFileSync(
    join(assetRoot, "manifests", "draft.yaml"),
    stringify({
      asset_id: "test-glyph.v1",
      runtime_ready: options.runtimeReady ?? true,
      outputs: { public_export: publicExport },
    }),
  );

  return {
    assetRoot,
    publicRoot,
    options: {
      assetRoot,
      publicRepositoryRoot: publicRoot,
      manifestPath: "manifests/draft.yaml",
    },
  };
}

function approvedForestFixture(options: {
  readonly reviewPng?: boolean;
  readonly forbiddenFilename?: string;
  readonly forbiddenPath?: Readonly<{ source: string; target: string }>;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "tokipona-forest-release-gate-"));
  temporaryRoots.push(root);
  const assetRoot = join(root, "asset-private");
  const publicRoot = join(root, "game-public");
  mkdirSync(join(assetRoot, "manifests"), { recursive: true });
  mkdirSync(join(assetRoot, "runtime"), { recursive: true });
  mkdirSync(join(assetRoot, "records"), { recursive: true });
  mkdirSync(join(assetRoot, "provenance"), { recursive: true });
  mkdirSync(publicRoot, { recursive: true });

  const releaseFiles = [
    forestReleaseFile("runtime/background-far.png", "background-far.png", "runtime_layer"),
    forestReleaseFile("runtime/background-mid.png", "background-mid.png", "runtime_layer"),
    forestReleaseFile("runtime/waterwheel-landmark.png", "waterwheel-landmark.png", "runtime_layer"),
    forestReleaseFile("runtime/forest-material-atlas.png", "forest-material-atlas.png", "runtime_atlas"),
    forestReleaseFile("runtime/traveler-atlas.png", "traveler-atlas.png", "runtime_atlas"),
    forestReleaseFile("runtime/time-palette.json", "time-palette.json", "runtime_palette"),
    forestReleaseFile("runtime/runtime-manifest.json", "runtime-manifest.json", "runtime_manifest"),
    ...(options.reviewPng
      ? [forestReleaseFile("review/contact-sheet.png", "review.png", "runtime_layer")]
      : []),
    ...(options.forbiddenFilename
      ? [forestReleaseFile(
          `runtime/${options.forbiddenFilename}`,
          options.forbiddenFilename,
          "runtime_layer",
        )]
      : []),
    ...(options.forbiddenPath
      ? [forestReleaseFile(
          options.forbiddenPath.source,
          options.forbiddenPath.target,
          "runtime_layer",
        )]
      : []),
  ];
  for (const file of releaseFiles) {
    const absoluteSource = join(assetRoot, ...file.source.split("/"));
    mkdirSync(join(absoluteSource, ".."), { recursive: true });
    writeFileSync(absoluteSource, file.content);
  }

  writeFileSync(join(assetRoot, "provenance", "license.txt"), "forest-license");
  writeFileSync(join(assetRoot, "records", "license.yaml"), stringify({
    status: "approved",
    source_url: "https://example.invalid/forest-visuals",
    source_url_status: "verified",
    redistribution_status: "approved",
    license_spdx: "CC0-1.0",
    files: {
      license: { path: "provenance/license.txt", sha256: sha256("forest-license") },
    },
  }));
  writeFileSync(join(assetRoot, "manifests", "forest.yaml"), stringify({
    asset_id: "forest.waterwheel.visual-benchmark.v001",
    runtime_ready: true,
    outputs: {
      public_export: {
        release_status: "approved",
        destination_root: "forest_chapter_visuals",
        destination: "waterwheel-benchmark/v0.1",
        license_record: "records/license.yaml",
        approvals: Object.fromEntries(
          ["source", "license", "pixel", "animation", "accessibility", "hashes"]
            .map((approval) => [approval, "approved"]),
        ),
        files: releaseFiles.map(({ content: _content, ...file }) => file),
      },
    },
  }));
  return {
    assetRoot,
    publicRepositoryRoot: publicRoot,
    manifestPath: "manifests/forest.yaml",
  };
}

function forestFixtureWithReviewPng() {
  return approvedForestFixture({ reviewPng: true });
}

function forestReleaseFile(source: string, target: string, role: string) {
  const content = `forest:${target}`;
  return { source, target, role, sha256: sha256(content), content };
}

function audit(fixture: ReturnType<typeof createFixture>) {
  return auditAssetRelease(fixture.options);
}

function reasonCodes(audit: ReturnType<typeof auditAssetRelease>): string[] {
  return audit.checks.filter((check) => !check.passed).map((check) => check.reasonCode);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPublicFiles(publicRoot: string): string[] {
  return readPublicFilesAt(publicRoot, PUBLIC_RUNTIME_ROOT);
}

function readPublicFilesAt(publicRoot: string, publicRuntimeRoot: string): string[] {
  const runtimeRoot = join(publicRoot, publicRuntimeRoot);
  try {
    return Array.from(new BunLikeRecursiveFiles(runtimeRoot, publicRuntimeRoot));
  } catch {
    return [];
  }
}

class BunLikeRecursiveFiles {
  readonly #root: string;
  readonly #publicRuntimeRoot: string;

  constructor(root: string, publicRuntimeRoot: string) {
    this.#root = root;
    this.#publicRuntimeRoot = publicRuntimeRoot;
  }

  *[Symbol.iterator](): Generator<string> {
    const { readdirSync } = requireNodeFs();
    for (const path of readdirSync(this.#root, { recursive: true })) {
      const absolute = join(this.#root, String(path));
      if (readFileStat(absolute).isFile()) {
        yield join(this.#publicRuntimeRoot, String(path)).replaceAll("\\", "/");
      }
    }
  }
}

function requireNodeFs(): typeof import("node:fs") {
  return globalThis.process.getBuiltinModule("node:fs") as typeof import("node:fs");
}

function readFileStat(path: string) {
  return requireNodeFs().statSync(path);
}
