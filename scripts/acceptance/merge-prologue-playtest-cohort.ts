import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mergeProloguePlaytestCohortFiles } from "../../src/acceptance/prologue-playtest-cohort-file.ts";

const rawArguments = process.argv.slice(2);
const args = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const [cohortId, outputArgument, ...inputArguments] = args;

if (!cohortId || !outputArgument || inputArguments.length === 0) {
  console.error("Usage: pnpm acceptance:cohort:merge -- <cohort-id> <new-output.json> <export.json> [export.json ...]");
  process.exitCode = 2;
} else {
  try {
    const outputPath = resolve(outputArgument);
    const inputPaths = inputArguments.map((path) => resolve(path));
    if (inputPaths.includes(outputPath)) throw new Error("merge output must not overwrite an input envelope");
    const candidates = await Promise.all(inputPaths.map(readCandidate));
    const merged = mergeProloguePlaytestCohortFiles({ cohortId, cohorts: candidates });
    await writeNewOutput(outputPath, merged);
    console.log(JSON.stringify({
      schemaVersion: "tokipona.prologue-playtest-cohort-merge-result.v0.1",
      status: "written",
      cohortId: merged.cohortId,
      sampleCount: merged.samples.length,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown cohort merge error";
    console.error(JSON.stringify({
      schemaVersion: "tokipona.prologue-playtest-cohort-merge-error.v0.1",
      status: "invalid",
      message,
    }));
    process.exitCode = 2;
  }
}

async function readCandidate(path: string, index: number): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error(`input envelope ${index + 1} could not be read as JSON`);
  }
}

async function writeNewOutput(path: string, value: unknown): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch {
    throw new Error("cohort output could not be written as a new file");
  }
}
