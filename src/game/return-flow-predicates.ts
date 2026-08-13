export const RETURN_FLOW_SOLUTION_IDS = Object.freeze([
  "return_flow.repair_overflow",
  "return_flow.clear_mud",
  "return_flow.reuse_old_channel",
] as const);

export type ReturnFlowSolutionId = (typeof RETURN_FLOW_SOLUTION_IDS)[number];

export interface ReturnFlowWorldFacts {
  readonly settlementSupplyFlowInBand: boolean;
  readonly wetMeadowFlowInBand: boolean;
  readonly overflowContact: boolean;
  readonly overflowGateSeated?: boolean;
  readonly overflowSealIntact?: boolean;
  readonly overflowConduitClear?: boolean;
  readonly mudMassBelowLimit?: boolean;
  readonly channelGradeContinuous?: boolean;
  readonly returnIntakeClear?: boolean;
  readonly oldChannelConnected?: boolean;
  readonly oldChannelClear?: boolean;
  readonly oldChannelBankStable?: boolean;
}

export interface ReturnFlowSolutionContract {
  readonly id: ReturnFlowSolutionId;
  readonly requiredActions: readonly string[];
}

const COMMON_READY = (facts: ReturnFlowWorldFacts): boolean =>
  facts.settlementSupplyFlowInBand &&
  facts.wetMeadowFlowInBand &&
  !facts.overflowContact;

export const returnFlowWorldReady = (
  solutionId: string,
  facts: ReturnFlowWorldFacts,
): boolean => {
  if (!COMMON_READY(facts)) return false;
  switch (solutionId) {
    case "return_flow.repair_overflow":
      return facts.overflowGateSeated === true && facts.overflowSealIntact === true &&
        facts.overflowConduitClear === true;
    case "return_flow.clear_mud":
      return facts.mudMassBelowLimit === true && facts.channelGradeContinuous === true &&
        facts.returnIntakeClear === true;
    case "return_flow.reuse_old_channel":
      return facts.oldChannelConnected === true && facts.oldChannelClear === true &&
        facts.oldChannelBankStable === true;
    default:
      return false;
  }
};

export const exactRequiredActionsCompleted = (
  contract: ReturnFlowSolutionContract,
  completedActionIds: readonly string[],
): boolean => {
  const completed = new Set(completedActionIds);
  return completed.size === completedActionIds.length &&
    completed.size === contract.requiredActions.length &&
    contract.requiredActions.every((actionId) => completed.has(actionId));
};
