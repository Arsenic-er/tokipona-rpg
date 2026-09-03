import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = resolve(
  repositoryRoot,
  "../tokipona-asset/exports/runtime/forest-chapter/waterwheel-benchmark/v0.5/traveler-atlas.v0.5.png",
);
const destination = resolve(
  repositoryRoot,
  "src/local-art-cache/traveler-atlas.v0.5.png",
);
const expectedSha256 = "f9b6e10487915241f92cdea57e8a27a86bb4994003122be410eb6676b6e48cca";
const bytes = readFileSync(source);
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error("local traveler atlas digest does not match the reviewed v0.5 candidate");
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("local_traveler_atlas_ready:v0.5");
