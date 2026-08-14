import { evaluateProloguePlaytestCohortFile } from
  "../../src/acceptance/prologue-playtest-cohort-file.ts";
import {
  evaluatePublicReleaseReadiness,
  type PublicReleaseReadinessReport,
} from "../../src/release/public-release-readiness.ts";
import { readRepositoryPublicRuntimeAssetBoundary } from
  "../assets/public-runtime-boundary.ts";

export function checkRepositoryPublicReleaseReadiness(
  repositoryRoot: string,
  observedCohortCandidate: unknown,
): PublicReleaseReadinessReport {
  return evaluatePublicReleaseReadiness({
    runtimeAssets: readRepositoryPublicRuntimeAssetBoundary(repositoryRoot),
    observedPlaytest: evaluateProloguePlaytestCohortFile(observedCohortCandidate),
  });
}
