import { describe, expect, it } from "vitest";
import { readRuntimeEcologyManifest } from "./runtime-ecology-manifest";

function validArtifact(): unknown {
  return {
    ecology: {
      sourceDigest: `sha256:${"a".repeat(64)}`,
      ecologyId: "valley_prologue",
      minimumWarningTelegraphSeconds: 0.7,
      intrusionBeforeDefenseSeconds: 1.5,
      loseSightSeconds: 4,
      deescalateSeconds: 6,
      mandatoryKills: 0,
      requiredQuestDrops: 0,
      languageEvidenceFromHarmForbidden: true,
      species: {
        rabbit: {
          entityId: "wildlife.rabbit.valley", species: "rabbit", maxHp: 8,
          homeSceneId: "scene.valley.return_channel", spawnAnchor: "wet_meadow.rabbit_burrow",
          realEscapeExit: "wet_meadow.rabbit_burrow_exit", warningZoneAnchor: null,
          defensiveActionKind: "kick", defensiveDamage: 2, guardingYoungDamage: null,
          defenseOnlyWhen: ["cornered", "young_threatened"], preferredResponse: "flee", returnCondition: null,
        },
        fox: {
          entityId: "wildlife.fox.den", species: "fox", maxHp: 20,
          homeSceneId: "scene.valley.den_bypass", spawnAnchor: "den.fox.rest_anchor",
          realEscapeExit: "den.fox.back_exit", warningZoneAnchor: "den.fox.young_area",
          defensiveActionKind: "bite_or_shove", defensiveDamage: 6, guardingYoungDamage: 8,
          defenseOnlyWhen: ["cornered", "young_threatened", "escape_blocked"],
          preferredResponse: "warn_then_flee",
          returnCondition: "life_state == alive && fox_den_intact && local_danger_cleared",
        },
      },
    },
  };
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

  it("rejects an abbreviated warning window", () => {
    const artifact = validArtifact() as { ecology: { minimumWarningTelegraphSeconds: number } };
    artifact.ecology.minimumWarningTelegraphSeconds = 0.69;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/at least 0.7/);
  });

  it("rejects defense before the authored retreat window", () => {
    const artifact = validArtifact() as { ecology: { intrusionBeforeDefenseSeconds: number } };
    artifact.ecology.intrusionBeforeDefenseSeconds = 1.49;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/at least 1.5/);
  });

  it("rejects tampered fox damage or missing return state", () => {
    const artifact = validArtifact() as { ecology: { species: { fox: { defensiveDamage: number; returnCondition: string | null } } } };
    artifact.ecology.species.fox.defensiveDamage = 60;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/fox projection/);
    artifact.ecology.species.fox.defensiveDamage = 6;
    artifact.ecology.species.fox.returnCondition = null;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/fox projection/);
  });

  it("rejects any kill/drop or harm-language reward drift", () => {
    const artifact = validArtifact() as { ecology: { mandatoryKills: number; languageEvidenceFromHarmForbidden: boolean } };
    artifact.ecology.mandatoryKills = 1;
    expect(() => readRuntimeEcologyManifest(artifact)).toThrow(/zero-kill/);
  });
});
