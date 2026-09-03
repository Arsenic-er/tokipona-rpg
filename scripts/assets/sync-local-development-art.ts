import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = resolve(
  repositoryRoot,
  "../tokipona-asset/exports/runtime/forest-chapter/waterwheel-benchmark/v0.6/traveler-atlas.v0.6.png",
);
const destination = resolve(
  repositoryRoot,
  "src/local-art-cache/traveler-atlas.v0.6.png",
);
const expectedSha256 = "6f1ab3cff9313ca2d69a684f632766c11ba23e4bb676b6448a5517b47a7a69ba";
const bytes = readFileSync(source);
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error("local traveler atlas digest does not match the reviewed v0.6 candidate");
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("local_traveler_atlas_ready:v0.6");
