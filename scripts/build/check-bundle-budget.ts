import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { assertBundleBudget, EXPECTED_BUILD_ENTRIES } from "./bundle-budget.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "dist");
const manifestPath = resolve(distRoot, ".vite/manifest.json");

if (!existsSync(manifestPath)) throw new Error("bundle_manifest_missing");
for (const entry of EXPECTED_BUILD_ENTRIES) {
  if (!existsSync(resolve(distRoot, entry))) throw new Error(`bundle_html_missing:${entry}`);
}

const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
const report = assertBundleBudget(manifest, (relativePath) => statSync(resolve(distRoot, relativePath)).size);
process.stdout.write(`${JSON.stringify(report)}\n`);
