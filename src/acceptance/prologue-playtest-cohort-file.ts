import {
  evaluateProloguePlaytestCohort,
  readProloguePlaytestSessionSample,
  type ProloguePlaytestCohortAcceptanceReport,
  type ProloguePlaytestSessionSample,
} from "./prologue-playtest-cohort.ts";

export const PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA = "tokipona.prologue-playtest-cohort.v0.1" as const;
export const PROLOGUE_PLAYTEST_COHORT_REPORT_SCHEMA = "tokipona.prologue-playtest-cohort-report.v0.1" as const;
export const PROLOGUE_PLAYTEST_COLLECTION_MODE = "anonymized_observed_playtest" as const;

const SEMANTIC_ID = /^[a-z0-9][a-z0-9_.:-]*$/;

export interface ProloguePlaytestCohortFile {
  readonly schemaVersion: typeof PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA;
  readonly collectionMode: typeof PROLOGUE_PLAYTEST_COLLECTION_MODE;
  readonly cohortId: string;
  readonly samples: readonly ProloguePlaytestSessionSample[];
}

export interface ProloguePlaytestCohortFileReport {
  readonly schemaVersion: typeof PROLOGUE_PLAYTEST_COHORT_REPORT_SCHEMA;
  readonly collectionMode: typeof PROLOGUE_PLAYTEST_COLLECTION_MODE;
  readonly cohortId: string;
  readonly status: "accepted" | "rejected";
  readonly acceptance: ProloguePlaytestCohortAcceptanceReport;
}

/**
 * Reads the portable, privacy-safe cohort envelope. The collectionMode is a
 * provenance declaration, not cryptographic proof that people supplied the
 * samples; deterministic runner output is intentionally a different shape.
 */
export function readProloguePlaytestCohortFile(candidate: unknown): ProloguePlaytestCohortFile {
  const value = record(candidate, "prologue playtest cohort file");
  exactKeys(value, ["schemaVersion", "collectionMode", "cohortId", "samples"], "prologue playtest cohort file");
  if (value.schemaVersion !== PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA) {
    throw new Error("prologue playtest cohort file schema is invalid");
  }
  if (value.collectionMode !== PROLOGUE_PLAYTEST_COLLECTION_MODE) {
    throw new Error("prologue playtest cohort must declare anonymized observed collection");
  }
  if (typeof value.cohortId !== "string" || !SEMANTIC_ID.test(value.cohortId)) {
    throw new Error("prologue playtest cohortId must be a semantic identifier");
  }
  if (!Array.isArray(value.samples)) throw new Error("prologue playtest cohort samples must be an array");
  const samples = Object.freeze(value.samples.map(readProloguePlaytestSessionSample));
  return Object.freeze({
    schemaVersion: PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
    collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
    cohortId: value.cohortId,
    samples,
  });
}

export function mergeProloguePlaytestCohortFiles(input: Readonly<{
  cohortId: string;
  cohorts: readonly unknown[];
}>): ProloguePlaytestCohortFile {
  if (!Array.isArray(input.cohorts) || input.cohorts.length === 0) {
    throw new Error("at least one observed cohort envelope is required");
  }
  const samples = input.cohorts.flatMap((candidate) => readProloguePlaytestCohortFile(candidate).samples);
  if (samples.length === 0) throw new Error("observed cohort envelopes contain no samples");
  const sessionIds = new Set<string>();
  for (const sample of samples) {
    if (sessionIds.has(sample.sessionId)) throw new Error("prologue playtest cohort contains duplicate session IDs");
    sessionIds.add(sample.sessionId);
  }
  return readProloguePlaytestCohortFile({
    schemaVersion: PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
    collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
    cohortId: input.cohortId,
    samples: [...samples].sort((left, right) => left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0),
  });
}

export function evaluateProloguePlaytestCohortFile(candidate: unknown): ProloguePlaytestCohortFileReport {
  const cohort = readProloguePlaytestCohortFile(candidate);
  const acceptance = evaluateProloguePlaytestCohort(cohort.samples);
  return Object.freeze({
    schemaVersion: PROLOGUE_PLAYTEST_COHORT_REPORT_SCHEMA,
    collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
    cohortId: cohort.cohortId,
    status: acceptance.accepted ? "accepted" : "rejected",
    acceptance,
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
