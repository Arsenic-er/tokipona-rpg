import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { parse } from "yaml";
import { compileContent, createSerializableManifestIndex } from "../../src/content/compiler.ts";
import type { ContentSource } from "../../src/content/types.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const dataRoot = resolve(repositoryRoot, "data");
const outputFlag = process.argv.indexOf("--out");
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;

const sources: ContentSource[] = readdirSync(dataRoot, { recursive: true })
  .map(String)
  .filter((path) => /\.(?:ya?ml|json)$/i.test(path))
  .sort()
  .map((path) => {
    const absolutePath = resolve(dataRoot, path);
    const raw = readFileSync(absolutePath, "utf8");
    return {
      path: relative(repositoryRoot, absolutePath).split(sep).join("/"),
      data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
    };
  });

const manifest = compileContent(sources);
const index = createSerializableManifestIndex(manifest);

if (outputPath) {
  const absoluteOutputPath = resolve(repositoryRoot, outputPath);
  writeFileSync(absoluteOutputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Compiled ${index.sources.length} content sources to ${absoluteOutputPath}.`);
} else {
  console.log(
    `Validated ${index.sources.length} content sources: ${index.ids.words.length} spell words, ` +
      `${index.ids.glyphs.length} glyphs, ${index.ids.tasks.length} task(s).`,
  );
}
