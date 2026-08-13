import { describe, expect, it } from "vitest";
import {
  exactRequiredActionsCompleted,
  returnFlowWorldReady,
  type ReturnFlowSolutionContract,
  type ReturnFlowWorldFacts,
} from "./return-flow-predicates";

const common: ReturnFlowWorldFacts = {
  settlementSupplyFlowInBand: true,
  wetMeadowFlowInBand: true,
  overflowContact: false,
};

const routes = [
  ["return_flow.repair_overflow", ["overflowGateSeated", "overflowSealIntact", "overflowConduitClear"]],
  ["return_flow.clear_mud", ["mudMassBelowLimit", "channelGradeContinuous", "returnIntakeClear"]],
  ["return_flow.reuse_old_channel", ["oldChannelConnected", "oldChannelClear", "oldChannelBankStable"]],
] as const;

describe("return-flow predicates", () => {
  it.each(routes)("requires every exact route fact for %s", (solutionId, routeFacts) => {
    const ready = { ...common, ...Object.fromEntries(routeFacts.map((fact) => [fact, true])) };
    expect(returnFlowWorldReady(solutionId, ready)).toBe(true);
    for (const fact of routeFacts) {
      expect(returnFlowWorldReady(solutionId, { ...ready, [fact]: false }), fact).toBe(false);
    }
  });

  it.each([
    ["settlementSupplyFlowInBand", false],
    ["wetMeadowFlowInBand", false],
    ["overflowContact", true],
  ] as const)("requires safe common fact %s", (fact, value) => {
    expect(returnFlowWorldReady("return_flow.repair_overflow", {
      ...common,
      overflowGateSeated: true,
      overflowSealIntact: true,
      overflowConduitClear: true,
      [fact]: value,
    })).toBe(false);
  });

  it("fails closed for an unknown runtime solution ID", () => {
    expect(returnFlowWorldReady("return_flow.invented", common)).toBe(false);
  });

  it("requires the exact authored action set", () => {
    const contract: ReturnFlowSolutionContract = {
      id: "return_flow.clear_mud",
      requiredActions: ["return_flow.clear_mud.mark", "return_flow.clear_mud.clear", "return_flow.clear_mud.stabilize"],
    };
    expect(exactRequiredActionsCompleted(contract, [...contract.requiredActions])).toBe(true);
    expect(exactRequiredActionsCompleted(contract, contract.requiredActions.slice(1))).toBe(false);
    expect(exactRequiredActionsCompleted(contract, [...contract.requiredActions, "invented_extra_action"])).toBe(false);
    expect(exactRequiredActionsCompleted(contract, [contract.requiredActions[0]!, contract.requiredActions[0]!,
      contract.requiredActions[2]!])).toBe(false);
  });
});