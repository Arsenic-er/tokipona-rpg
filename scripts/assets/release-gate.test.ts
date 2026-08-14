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
      `${PUBLIC_RUNTIME_ROOT.replaceAll("/", "\\")}\\test-glyph\\v1\\atlas.png`,
    ]);
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
  if (!source.includes("..")) {
    const absoluteSource = join(assetRoot, ...source.split("/"));
    mkdirSync(join(absoluteSource, ".."), { recursive: true });
    writeFileSync(absoluteSource, "runtime-atlas");
  }

  const licenseText = join(assetRoot, "provenance", "OFL.txt");
  const fontEvidence = join(assetRoot, "provenance", "font.bin");
  writeFileSync(licenseText, "license-evidence");
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
        license: { path: "provenance/OFL.txt", sha256: sha256("license-evidence") },
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
        destination: "test-glyph/v1",
        license_record: "records/license.yaml",
        approvals,
        files: [
          {
            source,
            target: options.target ?? "atlas.png",
            role: options.role ?? "runtime_atlas",
            sha256: options.declaredHash ?? sha256("runtime-atlas"),
          },
        ],
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
  const runtimeRoot = join(publicRoot, "public", "assets", "magic-glyphs");
  try {
    return Array.from(new BunLikeRecursiveFiles(runtimeRoot));
  } catch {
    return [];
  }
}

class BunLikeRecursiveFiles {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  *[Symbol.iterator](): Generator<string> {
    const { readdirSync } = requireNodeFs();
    for (const path of readdirSync(this.#root, { recursive: true })) {
      const absolute = join(this.#root, String(path));
      if (readFileStat(absolute).isFile()) yield join("public", "assets", "magic-glyphs", String(path));
    }
  }
}

function requireNodeFs(): typeof import("node:fs") {
  return globalThis.process.getBuiltinModule("node:fs") as typeof import("node:fs");
}

function readFileStat(path: string) {
  return requireNodeFs().statSync(path);
}
