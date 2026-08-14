import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
  PROLOGUE_PLAYTEST_COLLECTION_MODE,
  readProloguePlaytestCohortFile,
} from "../../src/acceptance/prologue-playtest-cohort-file";
import {
  PROLOGUE_PLAYTEST_SESSION_SCHEMA,
  type ProloguePlaytestSessionSample,
} from "../../src/acceptance/prologue-playtest-cohort";

const MINUTE_MS = 60_000;
const SCRIPT = resolve("scripts/acceptance/merge-prologue-playtest-cohort.ts");

describe("prologue playtest cohort merge CLI", () => {
  it("writes a new deterministic cohort once without echoing session records", () => {
    const root = mkdtempSync(join(tmpdir(), "tokipona-cohort-merge-"));
    try {
      const first = join(root, "first.json");
      const second = join(root, "second.json");
      const output = join(root, "merged.json");
      writeFileSync(first, JSON.stringify(cohort([sample(2)])), "utf8");
      writeFileSync(second, JSON.stringify(cohort([sample(1)])), "utf8");

      const written = runCli("cohort.prologue.cli", output, first, second);
      expect(written.status, written.stderr).toBe(0);
      expect(written.stdout).toContain('"sampleCount":2');
      expect(written.stdout).not.toContain("playtest.session");
      const merged = readProloguePlaytestCohortFile(JSON.parse(readFileSync(output, "utf8")) as unknown);
      expect(merged.samples.map((entry) => entry.sessionId)).toEqual(["playtest.session.1", "playtest.session.2"]);

      const overwrite = runCli("cohort.prologue.cli", output, first, second);
      expect(overwrite.status).toBe(2);
      expect(overwrite.stderr).toContain('"status":"invalid"');
      expect(overwrite.stderr).not.toContain("playtest.session");
      expect(overwrite.stderr).not.toContain(root);

      const inputOverwrite = runCli("cohort.prologue.cli", first, first, second);
      expect(inputOverwrite.status).toBe(2);
      expect(inputOverwrite.stderr).toContain("must not overwrite an input");
      expect(inputOverwrite.stderr).not.toContain(root);

      const unreadable = runCli("cohort.prologue.cli", join(root, "missing-output.json"), join(root, "missing-input.json"));
      expect(unreadable.status).toBe(2);
      expect(unreadable.stderr).toContain("input envelope 1 could not be read as JSON");
      expect(unreadable.stderr).not.toContain(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function runCli(cohortId: string, output: string, ...inputs: string[]) {
  return spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--experimental-transform-types",
    SCRIPT,
    cohortId,
    output,
    ...inputs,
  ], { cwd: process.cwd(), encoding: "utf8" });
}

function cohort(samples: readonly ProloguePlaytestSessionSample[]) {
  return {
    schemaVersion: PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
    collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
    cohortId: "cohort.local.export",
    samples,
  };
}

function sample(index: number): ProloguePlaytestSessionSample {
  return {
    schemaVersion: PROLOGUE_PLAYTEST_SESSION_SCHEMA,
    sessionId: `playtest.session.${index}`,
    contentActiveMs: 180 * MINUTE_MS,
    worldPeoplePhysicsActiveMs: 126 * MINUTE_MS,
    languageActiveMs: 36 * MINUTE_MS,
    longExplanationActiveMs: 18 * MINUTE_MS,
    survivalUiActiveMs: 216_000,
    languageInteractionCount: 100,
    needsInterruptedLanguageInteractionCount: 2,
    freeFoodWaterDiscoveryMs: 50_000,
    softFailureRecoveryDurationsMs: [90_000],
    rangeTrialPermissionContentMs: 159 * MINUTE_MS,
    firstAttackSignatureContentMs: 159 * MINUTE_MS,
    forcedHuntCount: 0,
    wildlifeHarmEventCount: 0,
    huntingIncomeCoin: 6,
    huntingActiveMs: 15 * MINUTE_MS,
    nonviolentJobIncomeCoin: 10,
    nonviolentJobActiveMs: 10 * MINUTE_MS,
    duplicateCorpseLotCurrencyCount: 0,
    minimumNeedsValueObserved: 20,
    maximumActiveNewWordsInAnySegment: 2,
  };
}
