import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { compileContent } from "../../src/content/compiler.ts";
import type { ContentSource } from "../../src/content/types.ts";
import {
  assertRuntimeArtifactCurrent,
  buildRuntimeContentArtifact,
  buildRuntimeLearningCorpusPackageBundle,
  RUNTIME_CONTENT_OUTPUT_PATH,
  RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH,
  serializeRuntimeContentArtifact,
  serializeRuntimeLearningCorpusPackageBundle,
} from "./runtime-artifact.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const dataRoot = resolve(repositoryRoot, "data");
const outputPath = resolve(repositoryRoot, RUNTIME_CONTENT_OUTPUT_PATH);
const packageOutputPath = resolve(repositoryRoot, RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH);
const checkOnly = process.argv.includes("--check");

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
const expected = serializeRuntimeContentArtifact(buildRuntimeContentArtifact(manifest));
const expectedPackages = serializeRuntimeLearningCorpusPackageBundle(
  buildRuntimeLearningCorpusPackageBundle(manifest));

if (checkOnly) {
  if (!existsSync(outputPath)) {
    throw new Error(`Generated runtime content is missing: ${RUNTIME_CONTENT_OUTPUT_PATH}.`);
  }
  if (!existsSync(packageOutputPath)) {
    throw new Error(`Generated runtime content is missing: ${RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH}.`);
  }
  assertRuntimeArtifactCurrent(readFileSync(outputPath, "utf8"), expected);
  assertRuntimeArtifactCurrent(readFileSync(packageOutputPath, "utf8"), expectedPackages);
  console.log(`Runtime content is current: ${RUNTIME_CONTENT_OUTPUT_PATH} and ${RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH}.`);
} else {
  writeFileSync(outputPath, expected, "utf8");
  writeFileSync(packageOutputPath, expectedPackages, "utf8");
  console.log(`Generated ${RUNTIME_CONTENT_OUTPUT_PATH} and ${RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH}.`);
}
