import { describe, expect, it } from "vitest";
import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import {
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
} from "./game/prologue-cistern";
import { PROLOGUE_SERVICE_CHANNEL_SCENE_ID } from "./game/prologue-waterwheel";
import { deriveCisternUiModel } from "./rpg-cistern-ui";

const asSnapshot = (value: unknown): PrologueFlowSnapshot => value as PrologueFlowSnapshot;

const sessionState = () => ({
  mp: { currentMp: 19, maxMp: 26, worldVersion: 3 },
  capabilities: { expressionCapacityWords: 2, focusSlots: 2, revision: 1, appliedMilestones: {} },
  learning: {
    words: {
      lili: { discoveryState: "discovered", attunementState: "attuned", learningState: "grounded", evidence: [{ id: "e1" }] },
      suli: { discoveryState: "unknown", attunementState: "locked", learningState: null, evidence: [] },
    },
  },
  world: {
    flags: {
      "region:valley_prologue:high_cistern_reconnected": {
        scope: "region", regionId: "valley_prologue", flagId: PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected, value: true,
      },
      "region:valley_prologue:upper_channel_available": {
        scope: "region", regionId: "valley_prologue", flagId: PROLOGUE_CISTERN_REGION_FLAGS.upperChannelAvailable, value: true,
      },
    },
  },
});

describe("RPG cistern UI model", () => {
  it("exposes the N04→N05 gateway only from the ready service channel", () => {
    const ready = deriveCisternUiModel(asSnapshot({
      mode: "infrastructure",
      runtime: { sceneId: PROLOGUE_SERVICE_CHANNEL_SCENE_ID },
      session: sessionState(),
      infrastructure: { serviceChannel: { cisternReady: true } },
      cistern: null,
    }));
    expect(ready).toMatchObject({ gatewayVisible: true, canEnter: true, panelVisible: false });

    const blocked = deriveCisternUiModel(asSnapshot({
      mode: "infrastructure",
      runtime: { sceneId: PROLOGUE_SERVICE_CHANNEL_SCENE_ID },
      session: sessionState(),
      infrastructure: { serviceChannel: { cisternReady: false } },
      cistern: null,
    }));
    expect(blocked).toMatchObject({ gatewayVisible: true, canEnter: false });
  });

  it("projects MP, capacity, preview, task families, words and atomic flags only from Flow snapshot", () => {
    const snapshot = asSnapshot({
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      session: sessionState(),
      infrastructure: null,
      cistern: {
        cistern: {
          stage: "default",
          selectedExpression: "telo_lili",
          selectedDirection: "east",
          pendingPlan: {
            activationMpRequired: 6,
            canConfirm: true,
            rejectionCode: null,
            preview: { geometry: { realizedLengthPx: 16 } },
          },
        },
        stages: { short: true, default: false, long: false },
        families: { "cistern.family_a.calibration": false, "cistern.family_b.transfer": false },
        completed: false,
        softLockRecovery: { maximumSeconds: 60 },
      },
    });
    const model = deriveCisternUiModel(snapshot);
    expect(model).toMatchObject({
      panelVisible: true,
      currentMp: 19,
      maxMp: 26,
      expressionCapacityWords: 2,
      focusSlots: 2,
      stage: "default",
      selectedExpression: "telo_lili",
      selectedDirection: "east",
      pendingPreview: true,
      previewMp: 6,
      previewLengthPx: 16,
      previewCanConfirm: true,
      completed: false,
      returnChannelAvailable: false,
      maximumRecoverySeconds: 60,
    });
    expect(model.stages).toEqual({ short: true, default: false, long: false });
    expect(model.families["cistern.family_a.calibration"]).toBe(false);
    expect(model.words.lili).toMatchObject({
      discovery: "discovered", attunement: "attuned", learning: "grounded", evidenceCount: 1,
    });
    expect(model.words.suli).toMatchObject({
      discovery: "unknown", attunement: "locked", learning: "not grounded", evidenceCount: 0,
    });
    expect(model.completionFlags).toEqual({
      [PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected]: true,
      [PROLOGUE_CISTERN_REGION_FLAGS.upperChannelAvailable]: true,
      [PROLOGUE_CISTERN_REGION_FLAGS.exitLadderLowered]: false,
    });
  });

  it("enables the explicit N07 entry only after N05 completion exposes the return channel", () => {
    const base = {
      mode: "cistern", runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID }, session: sessionState(), infrastructure: null,
      cistern: { cistern: { stage: "completed", selectedExpression: null, selectedDirection: null, pendingPlan: null },
        stages: { short: true, default: true, long: true }, families: {}, completed: true,
        returnChannelAvailable: true, softLockRecovery: { maximumSeconds: 60 } },
    };
    expect(deriveCisternUiModel(asSnapshot(base))).toMatchObject({
      panelVisible: true, completed: true, returnChannelAvailable: true,
    });
    expect(deriveCisternUiModel(asSnapshot({ ...base, cistern: { ...base.cistern, returnChannelAvailable: false } })))
      .toMatchObject({ completed: true, returnChannelAvailable: false });
  });

  it("does not retain a UI-side capacity or preview state between snapshots", () => {
    const firstSession = sessionState();
    const base = {
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      infrastructure: null,
      cistern: {
        cistern: { stage: "short", selectedExpression: "telo", selectedDirection: "east", pendingPlan: null },
        stages: { short: false, default: false, long: false },
        families: {}, completed: false, softLockRecovery: { maximumSeconds: 60 },
      },
    };
    const first = deriveCisternUiModel(asSnapshot({ ...base, session: firstSession }));
    const second = deriveCisternUiModel(asSnapshot({
      ...base,
      session: { ...firstSession, mp: { currentMp: 5, maxMp: 30 }, capabilities: { ...firstSession.capabilities, expressionCapacityWords: 4, focusSlots: 4 } },
    }));
    expect(first).toMatchObject({ currentMp: 19, maxMp: 26, expressionCapacityWords: 2, focusSlots: 2, pendingPreview: false });
    expect(second).toMatchObject({ currentMp: 5, maxMp: 30, expressionCapacityWords: 4, focusSlots: 4, pendingPreview: false });
  });
});
