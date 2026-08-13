export const WATERWHEEL_STABLE_TICKS_REQUIRED = 600 as const;
export const WATERWHEEL_MIN_STABLE_RPM = 8 as const;
export const WATERWHEEL_MAX_STABLE_RPM = 18 as const;

export type DownstreamFlowBand = "safe" | "caution" | "overflow";

export interface WaterwheelPhysicalObservation {
  readonly angularVelocityRpm: number;
  readonly elapsedTicks: number;
  readonly downstreamFlowBand: DownstreamFlowBand;
  readonly overflowContact: boolean;
}

export interface WaterwheelPhysicalProgress {
  readonly stableTicks: number;
  readonly lastAngularVelocityRpm: number;
  readonly downstreamSafe: boolean;
}

export interface WaterwheelSolutionWorldState {
  readonly naturalInflowReachesWheel?: boolean;
  readonly axleAlignmentSafe?: boolean;
  readonly axleSupported?: boolean;
  readonly wheelRotatesFreely?: boolean;
  readonly flumeAlignmentInBand?: boolean;
  readonly flumeLockEngaged?: boolean;
  readonly bypassFlowReachesWheel?: boolean;
  readonly bankErosionBelowLimit?: boolean;
  readonly temporaryFlowReachesWheel?: boolean;
  readonly mechanicalLockEngaged?: boolean;
  readonly downstreamFlowBandSafe: boolean;
}

export interface ServiceSolutionWorldState {
  readonly bypassValveOpen?: boolean;
  readonly bypassRouteClear?: boolean;
  readonly platformSupported?: boolean;
  readonly platformClearanceSafe?: boolean;
  readonly gateTrackClear?: boolean;
  readonly bankSlumpBelowLimit?: boolean;
  readonly stoneBaffleOffTrack?: boolean;
  readonly baffleChocked?: boolean;
  readonly externalHeatSourcePresent?: boolean;
  readonly thinIceMelted?: boolean;
  readonly woodTemperatureBelowIgnition?: boolean;
  readonly livingOverlapFalse?: boolean;
}

const finite = (value: number): boolean => Number.isFinite(value);

export const isStableWaterwheelRpm = (angularVelocityRpm: number): boolean =>
  finite(angularVelocityRpm) &&
  angularVelocityRpm >= WATERWHEEL_MIN_STABLE_RPM &&
  angularVelocityRpm <= WATERWHEEL_MAX_STABLE_RPM;

export const isDownstreamSafe = (
  observation: Pick<WaterwheelPhysicalObservation, "downstreamFlowBand" | "overflowContact">,
): boolean => !observation.overflowContact && observation.downstreamFlowBand === "safe";

export const advanceWaterwheelPhysicalProgress = (
  previous: WaterwheelPhysicalProgress,
  observation: WaterwheelPhysicalObservation,
): WaterwheelPhysicalProgress => {
  if (!Number.isSafeInteger(observation.elapsedTicks) || observation.elapsedTicks <= 0) {
    throw new RangeError("elapsedTicks must be a positive safe integer");
  }
  if (!finite(observation.angularVelocityRpm) || observation.angularVelocityRpm < 0) {
    throw new RangeError("angularVelocityRpm must be finite and non-negative");
  }
  const safe = isDownstreamSafe(observation);
  const stable = safe && isStableWaterwheelRpm(observation.angularVelocityRpm);
  return Object.freeze({
    stableTicks: stable
      ? Math.min(WATERWHEEL_STABLE_TICKS_REQUIRED, previous.stableTicks + observation.elapsedTicks)
      : 0,
    lastAngularVelocityRpm: observation.angularVelocityRpm,
    downstreamSafe: safe,
  });
};

export const waterwheelPhysicsReady = (progress: WaterwheelPhysicalProgress): boolean =>
  progress.stableTicks >= WATERWHEEL_STABLE_TICKS_REQUIRED &&
  progress.downstreamSafe &&
  isStableWaterwheelRpm(progress.lastAngularVelocityRpm);

/**
 * Maps generated solution IDs to typed world facts. This deliberately does not
 * parse or execute authored predicate strings.
 */
export const waterwheelSolutionWorldReady = (
  solutionId: string,
  state: WaterwheelSolutionWorldState,
): boolean => {
  if (!state.downstreamFlowBandSafe) return false;
  switch (solutionId) {
    case "waterwheel.clear_natural_inflow":
      return state.naturalInflowReachesWheel === true && state.axleAlignmentSafe === true;
    case "waterwheel.repair_axle":
      return state.axleSupported === true && state.wheelRotatesFreely === true;
    case "waterwheel.move_flume":
      return state.flumeAlignmentInBand === true && state.flumeLockEngaged === true;
    case "waterwheel.dig_bypass":
      return state.bypassFlowReachesWheel === true && state.bankErosionBelowLimit === true;
    case "waterwheel.manifest_then_lock":
      return state.temporaryFlowReachesWheel === true && state.mechanicalLockEngaged === true;
    default:
      return false;
  }
};

/** Typed N04 route facts; authored predicate strings remain documentation. */
export const serviceSolutionWorldReady = (
  solutionId: string,
  state: ServiceSolutionWorldState,
): boolean => {
  switch (solutionId) {
    case "service.open_bypass_valve":
      return state.bypassValveOpen === true && state.bypassRouteClear === true;
    case "service.place_wood_platform":
      return state.platformSupported === true && state.platformClearanceSafe === true;
    case "service.dig_wet_soil":
      return state.gateTrackClear === true && state.bankSlumpBelowLimit === true;
    case "service.move_stone_baffle":
      return state.stoneBaffleOffTrack === true && state.baffleChocked === true;
    case "service.external_heat_thin_ice":
      return state.externalHeatSourcePresent === true && state.thinIceMelted === true &&
        state.woodTemperatureBelowIgnition === true;
    case "service.optional_material_magic":
      return state.livingOverlapFalse === true && state.gateTrackClear === true;
    default:
      return false;
  }
};
