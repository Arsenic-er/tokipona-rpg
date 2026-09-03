import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = resolve(
  repositoryRoot,
  "../tokipona-asset/exports/runtime/forest-chapter/waterwheel-benchmark/v0.4/traveler-atlas.v0.4.png",
);
const destination = resolve(
  repositoryRoot,
  "src/local-art-cache/traveler-atlas.v0.4.png",
);
const expectedSha256 = "04780dbfec4eb61d7ac005c8f96115f3a31e7a6d8e125b35dd5fb6771ec0dcf9";
const bytes = readFileSync(source);
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error("local traveler atlas digest does not match the reviewed v0.4 candidate");
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("local_traveler_atlas_ready:v0.4");
