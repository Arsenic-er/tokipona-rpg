import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkRepositoryPublicReleaseReadiness } from "./public-release-readiness.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const rawArguments = process.argv.slice(2);
const argumentsWithoutSeparator = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const inputPath = argumentsWithoutSeparator[0];

if (!inputPath || argumentsWithoutSeparator.length !== 1) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "tokipona.public-release-readiness-error.v0.1",
    status: "invalid",
    reasonCode: "exactly_one_observed_cohort_path_required",
  })}\n`);
  process.exitCode = 2;
} else {
  try {
    const candidate = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
    const report = checkRepositoryPublicReleaseReadiness(repositoryRoot, candidate);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.status === "ready" ? 0 : 1;
  } catch {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: "tokipona.public-release-readiness-error.v0.1",
      status: "invalid",
      reasonCode: "release_readiness_input_invalid",
    })}\n`);
    process.exitCode = 2;
  }
}
