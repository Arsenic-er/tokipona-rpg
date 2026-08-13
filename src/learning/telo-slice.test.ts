import { describe, expect, it } from "vitest";
import { commitSessionProposal } from "../session/adapters";
import { GameSession, type SessionEconomySummary } from "../session/game-session";
import {
  TELO_ACTIVATION_FRAME_COUNT,
  TELO_ATTUNEMENT_ITEMS,
  TeloLearningSlice,
  createTeloVisualActivationFrames,
  type TeloProposalResult,
} from "./telo-slice";

const economyWithItems = (): SessionEconomySummary => ({
  coin: 0,
  walletRevision: 0,
  inventoryRevision: 0,
  lots: [
    { lotId: "lot.resonance", itemId: TELO_ATTUNEMENT_ITEMS.commonResonance, quantity: 2, ownershipRevision: 0, freshnessRevision: 0 },
    { lotId: "lot.water", itemId: TELO_ATTUNEMENT_ITEMS.waterSample, quantity: 2, ownershipRevision: 0, freshnessRevision: 0 },
  ],
});

const createSession = (economy = economyWithItems()): GameSession => GameSession.create({
  sessionId: "save.telo.test",
  currentSceneId: "scene.n01.stream",
  mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  economy,
});

const accepted = (proposal: TeloProposalResult): Extract<TeloProposalResult, { accepted: true }> => {
  expect(proposal.accepted).toBe(true);
  if (!proposal.accepted) throw new Error(`proposal rejected: ${proposal.reason}`);
  return proposal;
};

const commit = (session: GameSession, proposal: TeloProposalResult): GameSession => {
  const result = commitSessionProposal(session, accepted(proposal).batch);
  expect(result.committed).toBe(true);
  return result.session;
};

const context = (input: Partial<{
  attemptId: string;
  variantHash: string;
  environment: string;
  toolBypass: boolean;
  colorOnlyCue: boolean;
}> = {}) => ({
  attemptId: input.attemptId ?? "attempt.default",
  variantHash: input.variantHash ?? "variant.default",
  normalizedEnvironmentFingerprint: input.environment ?? "env.default",
  interpretationStatus: "parsed_grounded" as const,
  worldOutcomeContribution: true,
  toolBypass: input.toolBypass ?? false,
  answerVisible: false,
  fixedSlotOnly: false,
  colorOnlyCue: input.colorOnlyCue ?? false,
});

const discover = (slice: TeloLearningSlice, session: GameSession, occurrenceId = "n01.wall.001") =>
  slice.proposeDiscovery(session.snapshot(), { occurrenceId, locationId: `scene.n01:${occurrenceId}` });

const attune = (slice: TeloLearningSlice, session: GameSession, attemptId = "attune.001") =>
  slice.proposeAttunement(session.snapshot(), {
    attemptId,
    occurrenceId: "n01.wall.001",
    environmentalWitnessId: "witness.n01.clean-stream",
    outcome: "success",
  });

const discoveredAndAttuned = (): { session: GameSession; slice: TeloLearningSlice } => {
  const slice = new TeloLearningSlice("save.telo.test");
  let session = createSession();
  session = commit(session, discover(slice, session));
  session = commit(session, attune(slice, session));
  return { session, slice };
};

describe("TeloLearningSlice", () => {
  it("runs discovery, attunement, two environments, H0/H1 production and transfer to stabilized", () => {
    const slice = new TeloLearningSlice("save.telo.test");
    let session = createSession();
    session = commit(session, discover(slice, session));
    expect(session.snapshot().learning.words.telo).toMatchObject({
      discoveryState: "discovered", attunementState: "locked", learningState: "discovered",
    });
    session = commit(session, attune(slice, session));
    expect(session.snapshot().learning.words.telo?.attunementState).toBe("attuned");
    expect(session.snapshot().economy.lots.map((lot) => lot.quantity)).toEqual([1, 1]);

    session = commit(session, slice.proposeGrounding(session.snapshot(), {
      ...context({ attemptId: "ground.stream", variantHash: "ground.stream.v1", environment: "env.n01.stream" }),
      task: "streamRecognition", promptLevel: 1,
    }));
    session = commit(session, slice.proposeGrounding(session.snapshot(), {
      ...context({ attemptId: "ground.wash", variantHash: "ground.wash.v1", environment: "env.n02.basin" }),
      task: "washingUse", promptLevel: 0,
    }));
    expect(session.snapshot().learning.words.telo?.learningState).toBe("grounded");

    session = commit(session, slice.proposeProduction(session.snapshot(), {
      ...context({ attemptId: "produce.channel", variantHash: "produce.channel.v1", environment: "env.n03.channel" }),
      task: "channelWaterH0",
    }));
    session = commit(session, slice.proposeProduction(session.snapshot(), {
      ...context({ attemptId: "produce.wash", variantHash: "produce.wash.v1", environment: "env.n04.bearing" }),
      task: "washSootH1",
    }));
    expect(session.snapshot().learning.words.telo?.learningState).toBe("produced");

    session = commit(session, slice.proposeUnseenTransfer(session.snapshot(), {
      ...context({ attemptId: "unseen.001", variantHash: "unseen.condensation.v1", environment: "env.n06.condensation" }),
      promptLevel: 0,
    }));
    session = commit(session, slice.proposeDelayedRetrieval(session.snapshot(), {
      ...context({ attemptId: "delayed.001", variantHash: "delayed.camp.v1", environment: "env.n07.dry-camp" }),
      promptLevel: 1,
      unrelatedWorldEventIds: ["world.bridge-opened", "world.campfire-lit"],
    }));
    expect(session.snapshot().learning.words.telo).toMatchObject({
      discoveryState: "discovered", attunementState: "attuned", learningState: "stabilized",
    });
  });

  it("keeps the eight-frame activation transient", () => {
    const before = createSession().snapshot().learning;
    const frames = createTeloVisualActivationFrames();
    expect(frames).toHaveLength(TELO_ACTIVATION_FRAME_COUNT);
    expect(frames.map((frame) => frame.frameIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(frames.at(-1)).toEqual({ state: "active", frameIndex: 7 });
    expect(createSession().snapshot().learning).toEqual(before);
  });

  it("does not spend materials on failed, cancelled, or resource-incomplete attunement", () => {
    const slice = new TeloLearningSlice("save.telo.test");
    let session = createSession();
    session = commit(session, discover(slice, session));
    const before = session.snapshot();
    for (const outcome of ["failed", "cancelled"] as const) {
      const result = slice.proposeAttunement(session.snapshot(), {
        attemptId: `attune.${outcome}`,
        occurrenceId: "n01.wall.001",
        environmentalWitnessId: "witness.n01.clean-stream",
        outcome,
      });
      expect(result).toMatchObject({ accepted: false, reason: `attempt_${outcome}`, consumedItems: {} });
    }
    expect(session.snapshot()).toEqual(before);

    let empty = createSession({ ...economyWithItems(), lots: [] });
    empty = commit(empty, discover(slice, empty, "n01.wall.empty"));
    const missing = slice.proposeAttunement(empty.snapshot(), {
      attemptId: "attune.missing",
      occurrenceId: "n01.wall.empty",
      environmentalWitnessId: "witness.n01.clean-stream",
      outcome: "success",
    });
    expect(missing).toMatchObject({ accepted: false, reason: "missing_materials", consumedItems: {} });
    expect(empty.snapshot().learning.words.telo?.attunementState).toBe("locked");
  });

  it("spends exactly once and rejects duplicate and conflicting attunement payloads", () => {
    const slice = new TeloLearningSlice("save.telo.test");
    let session = createSession();
    session = commit(session, discover(slice, session));
    const first = accepted(attune(slice, session, "attune.idempotent"));
    session = commit(session, first);
    const after = session.snapshot();
    expect(attune(slice, session, "attune.idempotent")).toMatchObject({ accepted: false, reason: "duplicate_event" });
    const conflict = slice.proposeAttunement(session.snapshot(), {
      attemptId: "attune.idempotent",
      occurrenceId: "n01.wall.changed",
      environmentalWitnessId: "witness.n01.clean-stream",
      outcome: "success",
    });
    expect(conflict).toMatchObject({ accepted: false, reason: "idempotency_conflict" });
    const replay = commitSessionProposal(session, first.batch);
    expect(replay.committed).toBe(false);
    expect(replay.session.snapshot()).toEqual(after);
  });

  it("gives tool bypass and color-only cue zero evidence", () => {
    const { session, slice } = discoveredAndAttuned();
    const before = session.snapshot().learning;
    const bypass = slice.proposeGrounding(session.snapshot(), {
      ...context({ attemptId: "ground.tool", toolBypass: true }),
      task: "streamRecognition", promptLevel: 0,
    });
    const color = slice.proposeGrounding(session.snapshot(), {
      ...context({ attemptId: "ground.color", colorOnlyCue: true }),
      task: "washingUse", promptLevel: 0,
    });
    expect(bypass).toMatchObject({ accepted: false, reason: "ineligible_evidence" });
    expect(color).toMatchObject({ accepted: false, reason: "ineligible_evidence" });
    expect(session.snapshot().learning).toEqual(before);
  });
});
