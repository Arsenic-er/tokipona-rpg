import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { computeRuntimeEcologyDigest, readRuntimeEcologyManifest } from "./runtime-ecology-manifest";

function validArtifact(): unknown {
  return structuredClone(generatedRuntimeArtifact);
}

function resign(artifact: unknown): unknown {
  const mutable = artifact as { ecology: Record<string, unknown> };
  const payload = Object.fromEntries(Object.entries(mutable.ecology).filter(([key]) => key !== "sourceDigest"));
  mutable.ecology.sourceDigest = computeRuntimeEcologyDigest(payload);
  return mutable;
}

describe("runtime ecology manifest reader", () => {
  it("accepts the narrow typed rabbit and fox projection", () => {
    expect(readRuntimeEcologyManifest(validArtifact())).toMatchObject({
      minimumWarningTelegraphSeconds: 0.7,
      intrusionBeforeDefenseSeconds: 1.5,
      mandatoryKills: 0,
      species: { rabbit: { defensiveDamage: 2 }, fox: { defensiveDamage: 6, guardingYoungDamage: 8 } },
    });
  });

  it("rejects a re-signed return event that writes attack evidence", () => {
    const artifact = validArtifact() as { ecology: { returnAfterFlow: { attackQualificationEvidence: boolean } } };
    artifact.ecology.returnAfterFlow.attackQualificationEvidence = true;
    expect(() => readRuntimeEcologyManifest(resign(artifact))).toThrow(/return-after-flow/);
  });

  it("rejects an abbreviated warning window", () => {
    const artifact = validArtifact() as { ecology: { minimumWarningTelegraphSeconds: number } };
    artifact.ecology.minimumWarningTelegraphSeconds = 0.69;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/digest mismatch/);
  });

  it("rejects defense before the authored retreat window", () => {
    const artifact = validArtifact() as { ecology: { intrusionBeforeDefenseSeconds: number } };
    artifact.ecology.intrusionBeforeDefenseSeconds = 1.49;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/digest mismatch/);
  });

  it("rejects tampered fox damage or missing return state", () => {
    const artifact = validArtifact() as { ecology: { species: { fox: { defensiveDamage: number; returnCondition: string | null } } } };
    artifact.ecology.species.fox.defensiveDamage = 60;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/digest mismatch/);
    artifact.ecology.species.fox.defensiveDamage = 6;
    artifact.ecology.species.fox.returnCondition = null;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/digest mismatch/);
  });

  it("rejects any kill/drop or harm-language reward drift", () => {
    const artifact = validArtifact() as { ecology: { mandatoryKills: number; languageEvidenceFromHarmForbidden: boolean } };
    artifact.ecology.mandatoryKills = 1;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/digest mismatch/);
  });

  it("rejects semantic timing, guard, contact and spatial drift even with a matching digest", () => {
    const timing = validArtifact() as { ecology: { deescalateSeconds: number } };
    timing.ecology.deescalateSeconds = 61;
    expect(() => readRuntimeEcologyManifest(resign(timing))).toThrow(/safety bounds/);

    const guards = validArtifact() as { ecology: { species: { rabbit: { defenseOnlyWhen: string[] } } } };
    guards.ecology.species.rabbit.defenseOnlyWhen = ["cornered", "escape_blocked"];
    expect(() => readRuntimeEcologyManifest(resign(guards))).toThrow(/defense guards/);

    const contact = validArtifact() as { ecology: { defensiveContactTiles: number } };
    contact.ecology.defensiveContactTiles = 1.4;
    expect(() => readRuntimeEcologyManifest(resign(contact))).toThrow(/1.5 tiles/);

    const spatial = validArtifact() as { ecology: { foxSpatialBinding: { escapeBoundsTiles: { x: number } } } };
    spatial.ecology.foxSpatialBinding.escapeBoundsTiles.x = 27.5;
    expect(() => readRuntimeEcologyManifest(resign(spatial))).toThrow(/integer and inside N06/);
  });
});
