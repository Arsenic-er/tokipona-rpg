import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkPublicRuntimeAssetBoundary } from "./public-runtime-boundary.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const report = checkPublicRuntimeAssetBoundary({
    repositoryRoot,
    runtimeArtifact: readJson("src/generated/content-runtime.v0.1.json"),
    releaseContract: readJson("src/assets/runtime-release-contract.v0.1.json"),
    glyphCatalog: readJson("data/language/pu-120-glyph-catalog.v0.2.json"),
    p0PronunciationManifest: readJson("src/assets/p0-pronunciation-manifest.v0.1.json"),
    privateAssetExport: readJson("src/assets/runtime-core120-private-export.v0.1.json"),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "tokipona.public-asset-boundary-check.v0.2",
    status: "invalid",
    reasonCode: safeReason(error),
  })}\n`);
  process.exitCode = 1;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8"));
}

function safeReason(error: unknown): string {
  return error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
    ? error.message
    : "public_asset_boundary_invalid";
}
