import { resolve } from "node:path";
import { readRepositoryPublicRuntimeAssetBoundary } from "./public-runtime-boundary.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const report = readRepositoryPublicRuntimeAssetBoundary(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "tokipona.public-asset-boundary-check.v0.3",
    status: "invalid",
    reasonCode: safeReason(error),
  })}\n`);
  process.exitCode = 1;
}

function safeReason(error: unknown): string {
  return error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
    ? error.message
    : "public_asset_boundary_invalid";
}
