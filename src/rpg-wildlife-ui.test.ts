import { describe, expect, it } from "vitest";
import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import {
  PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
  PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
  PROLOGUE_WILDLIFE_SCENE_ID,
  PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
  PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
} from "./game/prologue-wildlife";
import { PROLOGUE_CISTERN_SCENE_ID } from "./game/prologue-cistern";
import { PROLOGUE_SERVICE_CHANNEL_SCENE_ID } from "./game/prologue-waterwheel";
import { deriveWildlifeUiModel, type WildlifeUiFlowSnapshot } from "./rpg-wildlife-ui";

const asSnapshot = (value: unknown): WildlifeUiFlowSnapshot => value as WildlifeUiFlowSnapshot;

function sessionState(flags: Readonly<Record<string, boolean>> = {}) {
  return {
    world: {
      flags: Object.fromEntries(Object.entries(flags).map(([flagId, value]) => [
        `region:valley_prologue:${flagId}`,
        { scope: "region", regionId: "valley_prologue", flagId, value },
      ])),
    },
  };
}

function wildlifeSnapshot(overrides: Readonly<Record<string, unknown>> = {}) {
  const base = {
    fox: { behaviorState: "warn", warningTicks: 42 },
    minimumWarningTicks: 42,
    foxPositionTiles: { x: 10, y: 1 },
    spatialBinding: {
      warningBoundsTiles: { x: 8, y: 0, width: 8, height: 5 },
      escapeBoundsTiles: { x: 24, y: 0, width: 2, height: 4 },
      denBoundsTiles: { x: 9, y: 0, width: 7, height: 4 },
      defensiveContactTiles: 1.5,
    },
    visitEvidence: {
      warningObservedWithoutHarm: true,
      playerHarmOccurred: false,
      playerRetreatedAfterWarning: true,
      realExitReached: false,
      outsideWarningZone: true,
      denIntactObserved: true,
      oldLatchOpened: false,
      lowForceNoiseUsed: false,
      lowForceStaffUsed: false,
      currentOutsideWarningZone: true,
      currentEscapeLaneOpen: true,
      currentPlayerRetreating: false,
      currentStaffDistanceSafe: false,
    },
    digProgress: { upperLineMarked: false, upperBypassClear: false, bracesInstalled: false, slumpBelowLimit: false },
    denRouteOpen: false,
    routeSolutionId: null,
    foxDenIntact: true,
    serviceReturnAlwaysOpen: true,
    highCisternReady: false,
    softLockRecovery: { maximumSeconds: 60, actions: [], preserves: [] },
    rewards: { kills: 0, drops: 0, learning: 0, mp: 0, capacity: 0, coin: 0, keyItems: 0 },
  };
  return { ...base, ...overrides };
}

function activeSnapshot(wildlife = wildlifeSnapshot()): WildlifeUiFlowSnapshot {
  return asSnapshot({
    mode: "wildlife",
    runtime: { sceneId: PROLOGUE_WILDLIFE_SCENE_ID },
    session: sessionState(),
    wildlife,
    arrival: null,
    settlement: null,
    infrastructure: null,
    cistern: null,
    killCount: 0,
  });
}

describe("RPG wildlife UI model", () => {
  it("shows an optional N04 gateway without claiming that the N05 mainline is blocked", () => {
    const model = deriveWildlifeUiModel(asSnapshot({
      mode: "infrastructure",
      runtime: { sceneId: PROLOGUE_SERVICE_CHANNEL_SCENE_ID },
      session: sessionState({ service_channel_reached: true }),
      infrastructure: { mode: "service_channel" },
      wildlife: null,
    }));
    expect(model).toMatchObject({
      gatewayVisible: true,
      gatewaySource: "service",
      canEnter: true,
      panelVisible: false,
      mainlineRemainsAvailable: true,
    });
    expect(model.gatewayCopy).toContain("主线入口仍然保留");
  });

  it("keeps the N05 return gateway disabled until the optional den route is already open", () => {
    const blocked = deriveWildlifeUiModel(asSnapshot({
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      session: sessionState(),
      wildlife: null,
    }));
    expect(blocked).toMatchObject({ gatewayVisible: true, gatewaySource: "cistern", canEnter: false });

    const opened = deriveWildlifeUiModel(asSnapshot({
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      session: sessionState({ den_route_open: true }),
      wildlife: null,
    }));
    expect(opened.canEnter).toBe(true);
  });

  it("projects the 42-tick warning, safe retreat and real-exit evidence without DPS or kill objectives", () => {
    const model = deriveWildlifeUiModel(activeSnapshot());
    expect(model).toMatchObject({
      panelVisible: true,
      behaviorState: "warn",
      behaviorLabel: "发出警告",
      warningTicks: 42,
      warningRequiredTicks: 42,
      warningProgress: 1,
      warningObserved: true,
      safeRetreatRecorded: true,
      realExitReached: false,
      playerOutsideWarningZone: true,
      escapeLaneOpen: true,
      zeroRewardContract: true,
    });
    expect(model.safetyCopy).toContain("没有 DPS 或击杀目标");
    expect(model.safetyCopy).toContain("0 击杀");
  });

  it("keeps all four zero-kill routes distinct and identifies their next safe step", () => {
    const model = deriveWildlifeUiModel(activeSnapshot());
    expect(model.routes.map((route) => route.solutionId)).toEqual([
      PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
      PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
      PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
      PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
    ]);
    expect(model.routes.map((route) => route.nextStep)).toEqual([
      "wait_for_real_exit",
      "make_low_force_noise",
      "use_wood_staff",
      "mark_upper_line",
    ]);
  });

  it("requires current safety, the real exit and the latch before non-dig completion", () => {
    const evidence = {
      ...wildlifeSnapshot().visitEvidence,
      realExitReached: true,
      oldLatchOpened: true,
      lowForceNoiseUsed: true,
      lowForceStaffUsed: true,
    };
    const ready = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({ visitEvidence: evidence })));
    expect(ready.routes.slice(0, 3).map((route) => route.ready)).toEqual([true, true, true]);

    const unsafe = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({
      visitEvidence: { ...evidence, currentOutsideWarningZone: false },
    })));
    expect(unsafe.routes.slice(0, 3).every((route) => !route.ready)).toBe(true);
  });

  it("derives the three dig interactions and fox clearance from projected state", () => {
    const marked = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({
      foxPositionTiles: { x: 20, y: 1 },
      digProgress: { upperLineMarked: true, upperBypassClear: false, bracesInstalled: false, slumpBelowLimit: false },
    })));
    expect(marked.routes[3]).toMatchObject({ nextStep: "dig_upper_bypass", ready: false });

    const ready = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({
      foxPositionTiles: { x: 20, y: 1 },
      digProgress: { upperLineMarked: true, upperBypassClear: true, bracesInstalled: true, slumpBelowLimit: true },
    })));
    expect(ready.routes[3]).toMatchObject({ nextStep: "complete_route", ready: true });
  });

  it("shows which route committed and enables only the two truthful exits", () => {
    const model = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({
      denRouteOpen: true,
      routeSolutionId: PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
      highCisternReady: true,
    })));
    expect(model).toMatchObject({ routeOpen: true, canReturnToService: true, canGoToCistern: true });
    expect(model.routes.find((route) => route.solutionId === PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID)).toMatchObject({
      completed: true,
      ready: false,
      nextStep: null,
    });
    expect(model.routes.filter((route) => route.solutionId !== PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID)
      .every((route) => route.nextStep === null && !route.ready)).toBe(true);
  });

  it("fails the reward-contract indicator if any projected reward is nonzero", () => {
    const model = deriveWildlifeUiModel(activeSnapshot(wildlifeSnapshot({
      rewards: { kills: 0, drops: 0, learning: 1, mp: 0, capacity: 0, coin: 0, keyItems: 0 },
    })));
    expect(model.zeroRewardContract).toBe(false);
  });

  it("remains structurally compatible with snapshots that do not yet expose wildlife", () => {
    const legacy = {
      mode: "arrival_stream",
      runtime: { sceneId: "scene.valley.arrival" },
      session: sessionState(),
      arrival: null,
      settlement: null,
      infrastructure: null,
      cistern: null,
      killCount: 0,
    } as unknown as PrologueFlowSnapshot;
    expect(deriveWildlifeUiModel(legacy)).toMatchObject({ gatewayVisible: false, panelVisible: false });
  });
});
