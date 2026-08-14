import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateProloguePlaytestCohortFile } from "../../src/acceptance/prologue-playtest-cohort-file.ts";

const rawArguments = process.argv.slice(2);
const argumentsWithoutSeparator = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const inputPath = argumentsWithoutSeparator[0];
if (!inputPath || argumentsWithoutSeparator.length !== 1) {
  console.error("Usage: pnpm acceptance:cohort -- <anonymized-cohort.json>");
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(resolve(inputPath), "utf8");
    const report = evaluateProloguePlaytestCohortFile(JSON.parse(source) as unknown);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === "accepted" ? 0 : 1;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown cohort input error";
    console.error(JSON.stringify({
      schemaVersion: "tokipona.prologue-playtest-cohort-error.v0.1",
      status: "invalid",
      message,
    }));
    process.exitCode = 2;
  }
}
