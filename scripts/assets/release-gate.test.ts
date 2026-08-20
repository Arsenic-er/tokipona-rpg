import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  auditAssetRelease,
  CORE120_PRONUNCIATION_WORD_IDS,
  exportApprovedAssetRelease,
  PUBLIC_PRONUNCIATION_ROOT,
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
  readonly pronunciationWordIds?: readonly string[];
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
      `${PUBLIC_RUNTIME_ROOT.replaceAll("/", "\\")}\\test-glyph\\v1\\atlas.png`,
    ]);
  });

  it("atomically exports approved pronunciation audio only to the flat pronunciation root", () => {
    const fixture = createFixture({
      source: "runtime/pronunciation/telo.ogg",
      target: "telo.ogg",
      role: "pronunciation_audio",
      destinationRoot: "pronunciation",
      destination: ".",
      pronunciationWordIds: CORE120_PRONUNCIATION_WORD_IDS,
    });
    const dryRun = exportApprovedAssetRelease({ ...fixture.options, dryRun: true });

    expect(dryRun.audit.decision).toBe("allow");
    expect(dryRun.publicDestination).toBe(PUBLIC_PRONUNCIATION_ROOT);
    expect(readPublicFilesAt(fixture.publicRoot, PUBLIC_PRONUNCIATION_ROOT)).toEqual([]);

    const result = exportApprovedAssetRelease(fixture.options);
    expect(result.audit.decision).toBe("allow");
    expect(result.exported).toBe(true);
    expect(
      readFileSync(join(fixture.publicRoot, PUBLIC_PRONUNCIATION_ROOT, "telo.ogg"), "utf8"),
    ).toBe("pronunciation-telo");
    const publicFiles = readPublicFilesAt(fixture.publicRoot, PUBLIC_PRONUNCIATION_ROOT);
    expect(publicFiles).toHaveLength(120);
    expect(publicFiles).toContain(
      `${PUBLIC_PRONUNCIATION_ROOT.replaceAll("/", "\\")}\\telo.ogg`,
    );
  });

  it("rejects role/root confusion, non-OGG audio, nested audio targets and unknown roots", () => {
    const audioInGlyphRoot = createFixture({
      source: "runtime/telo.ogg",
      target: "telo.ogg",
      role: "pronunciation_audio",
    });
    const glyphInAudioRoot = createFixture({
      destinationRoot: "pronunciation",
      destination: ".",
    });
    const wavAudio = createFixture({
      source: "runtime/telo.wav",
      target: "telo.wav",
      role: "pronunciation_audio",
      destinationRoot: "pronunciation",
      destination: ".",
    });
    const nestedAudio = createFixture({
      source: "runtime/telo.ogg",
      target: "nested/telo.ogg",
      role: "pronunciation_audio",
      destinationRoot: "pronunciation",
      destination: ".",
    });
    const unknownRoot = createFixture({ destinationRoot: "arbitrary_public_path" });

    expect(reasonCodes(audit(audioInGlyphRoot))).toContain("runtime_role_root_mismatch");
    expect(reasonCodes(audit(glyphInAudioRoot))).toContain("runtime_role_root_mismatch");
    expect(reasonCodes(audit(wavAudio))).toContain("runtime_extension_forbidden");
    expect(reasonCodes(audit(nestedAudio))).toContain("pronunciation_target_invalid");
    expect(reasonCodes(audit(unknownRoot))).toContain("destination_root_invalid");
  });

  it("rejects incomplete and substituted core-120 pronunciation packages before export", () => {
    const incomplete = createFixture({
      destinationRoot: "pronunciation",
      destination: ".",
      pronunciationWordIds: CORE120_PRONUNCIATION_WORD_IDS.slice(1),
    });
    const substituted = createFixture({
      destinationRoot: "pronunciation",
      destination: ".",
      pronunciationWordIds: [...CORE120_PRONUNCIATION_WORD_IDS.slice(1), "notaword"],
    });

    expect(reasonCodes(audit(incomplete))).toContain("pronunciation_file_set_invalid");
    expect(reasonCodes(audit(substituted))).toContain("pronunciation_file_set_invalid");
    expect(readPublicFilesAt(incomplete.publicRoot, PUBLIC_PRONUNCIATION_ROOT)).toEqual([]);
    expect(readPublicFilesAt(substituted.publicRoot, PUBLIC_PRONUNCIATION_ROOT)).toEqual([]);
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
  const releaseFiles = options.pronunciationWordIds === undefined
    ? [{
        source,
        target: options.target ?? "atlas.png",
        role: options.role ?? "runtime_atlas",
        sha256: options.declaredHash ?? sha256("runtime-atlas"),
        content: "runtime-atlas",
      }]
    : options.pronunciationWordIds.map((wordId) => ({
        source: `runtime/pronunciation/${wordId}.ogg`,
        target: `${wordId}.ogg`,
        role: "pronunciation_audio",
        sha256: sha256(`pronunciation-${wordId}`),
        content: `pronunciation-${wordId}`,
      }));
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
      if (readFileStat(absolute).isFile()) yield join(this.#publicRuntimeRoot, String(path));
    }
  }
}

function requireNodeFs(): typeof import("node:fs") {
  return globalThis.process.getBuiltinModule("node:fs") as typeof import("node:fs");
}

function readFileStat(path: string) {
  return requireNodeFs().statSync(path);
}
