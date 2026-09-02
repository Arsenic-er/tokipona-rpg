import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = resolve(
  repositoryRoot,
  "../tokipona-asset/exports/runtime/forest-chapter/waterwheel-benchmark/v0.3/traveler-atlas.v0.3.png",
);
const destination = resolve(
  repositoryRoot,
  "src/local-art-cache/traveler-atlas.v0.3.png",
);
const expectedSha256 = "24ceed213d9ef3b1fb98e752a8bbf28b73115a90ef67c07a874e681c5117da7a";
const bytes = readFileSync(source);
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error("local traveler atlas digest does not match the reviewed v0.3 candidate");
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("local_traveler_atlas_ready:v0.3");
