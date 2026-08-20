import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import {
  CORE120_BANDS,
  CORE120_VISUAL_DOMAINS,
  computeRuntimeCore120CurriculumDigest,
  isVerifiedRuntimeCore120CurriculumManifest,
  readRuntimeCore120CurriculumManifest,
} from "./runtime-core120-curriculum-manifest";
import type { ContentSource } from "./types";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text) }));
const progression = (all: ContentSource[]): Record<string, unknown> => all.find((source) => source.path.endsWith("glyph-progression.v0.1.yaml"))!.data as Record<string, unknown>;

function resign(artifact: unknown): unknown {
  const root = artifact as { core120Curriculum: Record<string, unknown> };
  const payload = Object.fromEntries(Object.entries(root.core120Curriculum).filter(([key]) => key !== "sourceDigest"));
  root.core120Curriculum.sourceDigest = computeRuntimeCore120CurriculumDigest(payload);
  return root;
}

function expectCompilerIssue(all: ContentSource[], code: string): void {
  try { compileContent(all); throw new Error("expected compile failure"); }
  catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  }
}

describe("core-120 runtime curriculum contract", () => {
  it("projects and verifies the exact 120-word corpus", () => {
    const value = readRuntimeCore120CurriculumManifest(generated);
    expect(isVerifiedRuntimeCore120CurriculumManifest(value)).toBe(true);
    expect(value.scope.wordIds).toHaveLength(120);
    expect(Object.keys(value.words)).toHaveLength(120);
    expect(value.scope.wordIds[0]).toBe("a");
    expect(value.scope.wordIds[119]).toBe("wile");
    expect(value.words.a.displayCodepoint).toBe("U+F1900");
    expect(value.words.wile.displayCodepoint).toBe("U+F1977");
    expect(value.scope.bandCounts).toEqual({ P0: 12, P1: 18, P2: 24, P3: 30, P4: 24, P5: 12 });
    expect(Object.keys(value.domainRoutes)).toEqual(CORE120_VISUAL_DOMAINS);
    expect(new Set(Object.values(value.words).map((word) => word.displayCodepoint)).size).toBe(120);
    for (const word of Object.values(value.words)) {
      expect(word.contexts).toHaveLength(2);
      expect(word.contexts[0].cueId).not.toBe(word.contexts[1].cueId);
      expect(word.contexts[0].taskFamilyId).not.toBe(word.contexts[1].taskFamilyId);
      expect(word.contexts[0].location).toEqual(value.domainRoutes[word.visualDomainId].primary);
      expect(word.contexts[1].location).toEqual(value.domainRoutes[word.visualDomainId].reinforcement);
      expect(word.misconceptionRepair.cueVariants).toEqual(word.contexts.map((context) => context.cueId));
      expect(word.assetBindings).toEqual({ glyphAssetId: `glyph.pu120.${word.wordId}.v2` });
    }
    expect(value.recoveryStation).toEqual({ sceneId: "scene.valley.settlement", targetId: "settlement.p0_inscription_archive", interactionPointTiles: [38, 28], interactionPointPx: { x: 608, y: 448 }, interactionId: "settlement.open_p0_inscription_archive", maximumDistancePx: 16 });
    expect(value.worldContextAuthority).toEqual({ maximumDistancePx: 16,
      recoveryRequiresPriorSceneVisit: true, sceneCoordinateOrigins: {
        "scene.valley.settlement": "top_left", "scene.valley.den_bypass": "bottom_left",
        "scene.valley.return_channel": "bottom_left", "scene.valley.safe_range": "bottom_left",
        "scene.valley.old_mine_threshold": "bottom_left",
      } });
    expect(value.catalogReviewStatus).toBe("draft");
    expect(value.catalogRuntimeReady).toBe(false);
    expect(value.learningContract).toMatchObject({
      evidenceIdentityVersion: "core120-learning-evidence.v0.2",
      semanticDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      compatibleLegacyContracts: [{
        sourceDigest: "sha256:5d6d824a0c0397b109e5f3934f7f7ec92bdebef912368c5c7ea680b5f3721f2c",
        semanticDigest: "sha256:fba08cdb6158c93ccb08eef9d65fab06621c0c12f04f57ae72e71b194da3e0b8",
      },
      ],
    });
    expect(value.acceptance).toMatchObject({
      allWordsRecoverable: true,
      contextsPerWord: 2,
      misconceptionRepairsPerWord: 1,
      audioPolicy: {
        spokenPronunciationRequired: false,
        dialogueFeedback: "procedural_nonsemantic",
        progressMayDependOnAudio: false,
        captionsRequired: true,
      },
      communitySemanticReviewRequired: true,
    });
  });

  it("isolates evidence semantics from catalog approval state", () => {
    const draft = readRuntimeCore120CurriculumManifest(generated);
    const approved = structuredClone(generated) as any;
    approved.core120Curriculum.catalogReviewStatus = "approved";
    approved.core120Curriculum.catalogRuntimeReady = true;
    const verifiedApproved = readRuntimeCore120CurriculumManifest(resign(approved));
    expect(verifiedApproved.sourceDigest).not.toBe(draft.sourceDigest);
    expect(verifiedApproved.learningContract.semanticDigest)
      .toBe(draft.learningContract.semanticDigest);

    const forgedCompatibility = structuredClone(generated) as any;
    forgedCompatibility.core120Curriculum.learningContract.compatibleLegacyContracts[0].sourceDigest =
      `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeCore120CurriculumManifest(resign(forgedCompatibility)))
      .toThrow(/learning contract/);
  });

  it("rejects checksum tampering and re-signed semantic drift", () => {
    const checksum = structuredClone(generated) as any;
    checksum.core120Curriculum.words.a.targetState = "attuned";
    expect(() => readRuntimeCore120CurriculumManifest(checksum)).toThrow(/digest mismatch/);

    const codepoint = structuredClone(generated) as any;
    codepoint.core120Curriculum.words.a.displayCodepoint = "U+F1977";
    expect(() => readRuntimeCore120CurriculumManifest(resign(codepoint))).toThrow(/identity/);

    const family = structuredClone(generated) as any;
    family.core120Curriculum.words.akesi.contexts[1].taskFamilyId = family.core120Curriculum.words.akesi.contexts[0].taskFamilyId;
    expect(() => readRuntimeCore120CurriculumManifest(resign(family))).toThrow(/context 1 is invalid|distinct/);

    const route = structuredClone(generated) as any;
    route.core120Curriculum.words.telo.contexts[0].location.targetId = "settlement.supply_stall";
    expect(() => readRuntimeCore120CurriculumManifest(resign(route))).toThrow(/context 0 is invalid/);

    const asset = structuredClone(generated) as any;
    asset.core120Curriculum.words.wile.assetBindings.pronunciationAssetId = "audio.pronunciation.wile.v1";
    expect(() => readRuntimeCore120CurriculumManifest(resign(asset))).toThrow(/unknown or missing/);

    const legacyAudio = structuredClone(generated) as any;
    legacyAudio.core120Curriculum.acceptance.audioPolicy = {
      spokenPronunciationRequired: false,
      dialogueFeedback: "procedural_nonsemantic",
      progressMayDependOnAudio: false,
      captionsRequired: true,
      pronunciationAssetId: "audio.pronunciation.wile.v1",
    };
    expect(() => readRuntimeCore120CurriculumManifest(resign(legacyAudio))).toThrow(/unknown or missing/);

    const unknown = structuredClone(generated) as any;
    unknown.core120Curriculum.words.jan.runtimeOverride = true;
    expect(() => readRuntimeCore120CurriculumManifest(resign(unknown))).toThrow(/unknown or missing/);

    const premature = structuredClone(generated) as any;
    premature.core120Curriculum.catalogRuntimeReady = true;
    expect(() => readRuntimeCore120CurriculumManifest(resign(premature))).toThrow(/release status/);

    const authority = structuredClone(generated) as any;
    authority.core120Curriculum.worldContextAuthority.recoveryRequiresPriorSceneVisit = false;
    expect(() => readRuntimeCore120CurriculumManifest(resign(authority))).toThrow(/world context authority/);

    const point = structuredClone(generated) as any;
    point.core120Curriculum.domainRoutes.D_MATTER_ENV.primary.interactionPointPx.y = 16;
    point.core120Curriculum.words.telo.contexts[0].location.interactionPointPx.y = 16;
    expect(() => readRuntimeCore120CurriculumManifest(resign(point))).toThrow(/valid distinct world witnesses/);
  });

  it("rejects source policy, recovery, and route drift before projection", () => {
    const actionDrift = sources();
    (progression(actionDrift).runtime_curriculum as Record<string, unknown>).action_kinds = ["discover", "attune"];
    expectCompilerIssue(actionDrift, "contract.core120_policy");

    const spokenRequired = sources();
    (progression(spokenRequired).runtime_curriculum as Record<string, unknown>).audio_policy = {
      spoken_pronunciation_required: true,
      dialogue_feedback: "procedural_nonsemantic",
      progress_may_depend_on_audio: false,
      captions_required: true,
    };
    expectCompilerIssue(spokenRequired, "contract.speechless_audio_policy");

    const legacyDigestDrift = sources();
    (progression(legacyDigestDrift).runtime_curriculum as Record<string, unknown>)
      .compatible_legacy_learning_contracts = [{
        source_digest: `sha256:${"0".repeat(64)}`,
        semantic_digest: "sha256:fba08cdb6158c93ccb08eef9d65fab06621c0c12f04f57ae72e71b194da3e0b8",
      }];
    expectCompilerIssue(legacyDigestDrift, "contract.core120_policy");

    const recoveryDrift = sources();
    ((progression(recoveryDrift).runtime_curriculum as Record<string, unknown>).recovery_station as Record<string, unknown>).maximum_distance_px = 99;
    expectCompilerIssue(recoveryDrift, "contract.core120_recovery");

    const authorityDrift = sources();
    ((progression(authorityDrift).runtime_curriculum as Record<string, unknown>)
      .world_context_authority as Record<string, unknown>).recovery_requires_prior_scene_visit = false;
    expectCompilerIssue(authorityDrift, "contract.core120_world_context_authority");

    const missingRoute = sources();
    delete ((progression(missingRoute).runtime_curriculum as Record<string, unknown>).domain_routes as Record<string, unknown>).D_SPACE_TIME;
    expectCompilerIssue(missingRoute, "contract.core120_routes");

    const invalidPoint = sources();
    const domains = (progression(invalidPoint).runtime_curriculum as Record<string, unknown>).domain_routes as Record<string, Record<string, Record<string, unknown>>>;
    domains.D_LIFE_ENTITY!.primary!.interaction_point_tiles = [-1, 0];
    expectCompilerIssue(invalidPoint, "contract.core120_route");
  });

  it("keeps all six curriculum bands present in canonical order", () => {
    const value = readRuntimeCore120CurriculumManifest(generated);
    expect(CORE120_BANDS.map((band) => value.scope.bandCounts[band])).toEqual([12, 18, 24, 30, 24, 12]);
  });
});
