import { describe, expect, it, vi } from "vitest";
import { TELO_LENGTH_PROFILES } from "./content-profiles";
import {
  CastExecutionLedger,
  compileTeloCastWithProfiles,
  compileTeloCast,
  createTeloCastPlan,
  executeCastPlan,
  type TeloCanonicalAst,
  type TeloCastPlanRequest,
  type TeloLengthProfileSet,
} from "./cast-plan";

const ast = (lengthModifier: TeloCanonicalAst["lengthModifier"]): TeloCanonicalAst => ({
  head: "word.telo",
  lengthModifier,
});

const request = (overrides: Partial<TeloCastPlanRequest> = {}): TeloCastPlanRequest => ({
  canonicalAst: ast(null),
  anchorPx: { x: 40, y: 40 },
  direction: { x: 1, y: 0 },
  currentMp: 24,
  worldVersion: 7,
  ...overrides,
});

describe("createTeloCastPlan", () => {
  it.each([
    ["word.lili", "short", 16, 6],
    [null, "default", 32, 5],
    ["word.suli", "long", 64, 10],
  ] as const)(
    "freezes %s as the expected geometry and MP quote",
    (modifier, lengthClass, lengthPx, activationMp) => {
      const plan = createTeloCastPlan(request({ canonicalAst: ast(modifier) }));
      const geometry = plan.preview.geometry;

      expect(plan).toMatchObject({
        requestedLengthClass: lengthClass,
        resolvedLengthClass: lengthClass,
        activationMpRequired: activationMp,
        canConfirm: true,
        rejectionCode: null,
        gravityApplies: true,
        directAttack: false,
        initialVelocityPxPerSecond: { x: 0, y: 0 },
      });
      expect(geometry).toMatchObject({
        nominalLengthPx: lengthPx,
        realizedLengthPx: lengthPx,
        fixedCrossSectionWidthPx: 12,
        simulationCellSizePx: 2,
        simulationLengthCells: lengthPx / 2,
        simulationWidthCells: 6,
      });
      expect(plan.preview.geometry).toBe(plan.execution.geometry);
      expect(geometry.worldPixelGeometry.realizedLengthPx).toBe(lengthPx);
      expect(geometry.simulationCellGeometry).toMatchObject({
        cellSizePx: 2,
        lengthCells: lengthPx / 2,
        widthCells: 6,
      });
      expect(geometry.simulationCells).toHaveLength((lengthPx / 2) * 6);
    },
  );

  it("converts the same logical geometry to the 2x2 simulation footprint", () => {
    const plan = createTeloCastPlan(request({
      canonicalAst: ast("word.lili"),
      anchorPx: { x: 10, y: 12 },
    }));

    expect(plan.preview.geometry.simulationCells).toEqual(
      Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 8 }, (_, column) => ({ x: 5 + column, y: 3 + row })),
      ).flat(),
    );
  });

  it.each([
    ["horizontal", { x: 1, y: 0 }, { x: 26, y: 12 }],
    ["vertical", { x: 0, y: 1 }, { x: 10, y: 28 }],
    ["diagonal-down", { x: 1, y: -1 }, { x: 21, y: 1 }],
    ["diagonal-up", { x: 1, y: 1 }, { x: 21, y: 23 }],
  ] as const)("keeps a fixed manifestation mass footprint for %s casts", (_, direction, endpointPx) => {
    const input = request({
      canonicalAst: ast("word.lili"),
      anchorPx: { x: 10, y: 12 },
      direction,
    });
    const first = compileTeloCast(input);
    const second = compileTeloCast(input);
    const geometry = first.execution.geometry;

    expect(geometry.endpointPx).toEqual(endpointPx);
    expect(geometry.worldPixelGeometry.areaPx2).toBe(16 * 12);
    expect(geometry.massCalculationBasis).toBe("world_pixel_area");
    expect(geometry.simulationCellGeometry.manifestationCells).toHaveLength(48);
    expect(new Set(geometry.simulationCells.map((cell) => `${cell.x},${cell.y}`))).toHaveLength(48);
    expect(geometry.simulationCells).toEqual(second.execution.geometry.simulationCells);
  });

  it("keeps the requested class while rejecting below its truncation minimum", () => {
    const blockedDefault = createTeloCastPlan(request({
      maximumRealizableLengthPx: 20,
      blockingObjectId: "cistern.short.stone_baffle",
    }));
    const blockedLong = createTeloCastPlan(request({
      canonicalAst: ast("word.suli"),
      maximumRealizableLengthPx: 36,
      blockingObjectId: "cistern.default.backstop",
    }));

    expect(blockedDefault).toMatchObject({
      requestedLengthClass: "default",
      resolvedLengthClass: "default",
      activationMpRequired: 5,
      canConfirm: false,
      rejectionCode: "requested_class_cannot_be_realized_here",
    });
    expect(blockedDefault.preview.geometry.realizedLengthPx).toBe(20);
    expect(blockedLong).toMatchObject({
      requestedLengthClass: "long",
      resolvedLengthClass: "long",
      activationMpRequired: 10,
      canConfirm: false,
      rejectionCode: "requested_class_cannot_be_realized_here",
    });
    expect(blockedLong.preview.geometry.realizedLengthPx).toBe(36);
  });

  it("rejects living safety overlap before MP can be charged", () => {
    const plan = createTeloCastPlan(request({
      canonicalAst: ast("word.suli"),
      livingSafetyZones: [{
        entityId: "creature.fox.1",
        boundsPx: { x: 70, y: 38, width: 4, height: 4 },
      }],
    }));

    expect(plan).toMatchObject({
      canConfirm: false,
      rejectionCode: "living_safety_volume_blocked",
      blockedLivingEntityId: "creature.fox.1",
      activationMpRequired: 10,
    });
  });

  it("quotes the requested long form but rejects insufficient MP without downgrading", () => {
    const plan = createTeloCastPlan(request({
      canonicalAst: ast("word.suli"),
      currentMp: 9,
    }));

    expect(plan).toMatchObject({
      requestedLengthClass: "long",
      resolvedLengthClass: "long",
      activationMpRequired: 10,
      quotedCurrentMp: 9,
      canConfirm: false,
      rejectionCode: "requested_class_requires_more_mp",
    });
    expect(plan.preview.geometry.realizedLengthPx).toBe(64);
  });

  it("compiles geometry and MP from an injected frozen content profile", () => {
    const changedProfiles: TeloLengthProfileSet = Object.freeze({
      ...TELO_LENGTH_PROFILES,
      short: Object.freeze({
        ...TELO_LENGTH_PROFILES.short,
        profileVersion: "g02.length-profiles.test-change",
        nominalLengthPx: 18,
        minimumRealizedLengthPx: 10,
        activationMp: 7,
        crossSectionWidthPx: 14,
      }),
      default: Object.freeze({
        ...TELO_LENGTH_PROFILES.default,
        profileVersion: "g02.length-profiles.test-change",
      }),
      long: Object.freeze({
        ...TELO_LENGTH_PROFILES.long,
        profileVersion: "g02.length-profiles.test-change",
      }),
    });

    const plan = compileTeloCastWithProfiles(request({
      canonicalAst: ast("word.lili"),
      currentMp: 24,
    }), changedProfiles);

    expect(plan).toMatchObject({
      profileVersion: "g02.length-profiles.test-change",
      activationMpRequired: 7,
      canConfirm: true,
    });
    expect(plan.execution.geometry).toMatchObject({
      nominalLengthPx: 18,
      realizedLengthPx: 18,
      fixedCrossSectionWidthPx: 14,
      simulationLengthCells: 9,
      simulationWidthCells: 7,
      manifestationCellCount: 63,
    });
  });

  it("requires injected content profiles and their entries to be frozen", () => {
    expect(() => compileTeloCastWithProfiles(request(), {
      ...TELO_LENGTH_PROFILES,
    })).toThrowError(/profile set must be frozen/);
  });

  it("fails closed for non-finite length, malformed safety zones, and unaligned anchors", () => {
    const invalidLength = compileTeloCast(request({ maximumRealizableLengthPx: Number.NaN }));
    const malformedZone = compileTeloCast(request({
      livingSafetyZones: [{
        entityId: "creature.bad-zone",
        boundsPx: { x: 40, y: 40, width: 0, height: 4 },
        marginPx: Number.NaN,
      }],
    }));
    const oddAnchor = compileTeloCast(request({ anchorPx: { x: 41, y: 40 } }));

    expect(invalidLength.rejectionCode).toBe("invalid_realizable_length");
    expect(malformedZone.rejectionCode).toBe("invalid_living_safety_zone");
    expect(oddAnchor.rejectionCode).toBe("invalid_anchor");
    expect(invalidLength.canConfirm).toBe(false);
    expect(malformedZone.canConfirm).toBe(false);
    expect(oddAnchor.canConfirm).toBe(false);
  });

  it("rejects unsupported runtime ASTs and invalid placement inputs", () => {
    const unsupported = createTeloCastPlan(request({
      canonicalAst: { head: "word.telo", lengthModifier: "word.ante" } as unknown as TeloCanonicalAst,
    }));
    const directionless = createTeloCastPlan(request({ direction: { x: 0, y: 0 } }));
    const staleVersion = createTeloCastPlan(request({ worldVersion: -1 }));

    expect(unsupported.rejectionCode).toBe("unsupported_expression");
    expect(directionless.rejectionCode).toBe("invalid_direction");
    expect(staleVersion.rejectionCode).toBe("invalid_world_version");
  });

  it("exports the stable compileTeloCast integration entry", () => {
    const plan = compileTeloCast(request({ canonicalAst: ast("word.lili") }));

    expect(plan.requestedLengthClass).toBe("short");
    expect(plan.execution.geometry.simulationCellGeometry.cells).toBe(
      plan.preview.geometry.simulationCellGeometry.cells,
    );
  });
});

describe("executeCastPlan", () => {
  it("returns a pure world-mutation authorization and next snapshot", () => {
    const plan = compileTeloCast(request({ worldVersion: 2 }));

    const decision = executeCastPlan(plan, {
      currentMp: 24,
      currentWorldVersion: 2,
      idempotencyKey: "cast.pure.1",
    });

    expect(decision).toEqual({
      accepted: true,
      duplicate: false,
      shouldApplyWorldMutation: true,
      planId: plan.planId,
      idempotencyKey: "cast.pure.1",
      mpCharge: 5,
      nextSnapshot: { mp: 19, worldVersion: 3 },
      rejectionCode: null,
    });
  });

  it("rejects frozen forged costs and forged empty geometry", () => {
    const plan = compileTeloCast(request({ worldVersion: 2 }));
    const forgedCost = Object.freeze({ ...plan, activationMpRequired: -5 });
    const emptyGeometry = Object.freeze({
      ...plan.execution.geometry,
      simulationCells: Object.freeze([]),
      manifestationCellCount: 0,
    });
    const forgedGeometry = Object.freeze({
      ...plan,
      preview: Object.freeze({ geometry: emptyGeometry }),
      execution: Object.freeze({ geometry: emptyGeometry }),
    });
    const context = { currentMp: 24, currentWorldVersion: 2, idempotencyKey: "cast.forged" };

    expect(executeCastPlan(forgedCost, context)).toMatchObject({
      accepted: false,
      mpCharge: 0,
      rejectionCode: "untrusted_cast_plan",
      nextSnapshot: { mp: 24, worldVersion: 2 },
    });
    expect(executeCastPlan(forgedGeometry, context)).toMatchObject({
      accepted: false,
      mpCharge: 0,
      rejectionCode: "untrusted_cast_plan",
    });
  });

  it("rejects a plan compiled from a changed profile at the official execution boundary", () => {
    const futureVersion = "g02.length-profiles.future-test";
    const changedProfiles: TeloLengthProfileSet = Object.freeze({
      short: Object.freeze({ ...TELO_LENGTH_PROFILES.short, profileVersion: futureVersion }),
      default: Object.freeze({
        ...TELO_LENGTH_PROFILES.default,
        profileVersion: futureVersion,
        nominalLengthPx: 34,
        minimumRealizedLengthPx: 26,
        activationMp: 7,
        crossSectionWidthPx: 14,
      }),
      long: Object.freeze({ ...TELO_LENGTH_PROFILES.long, profileVersion: futureVersion }),
    });
    const changedPlan = compileTeloCastWithProfiles(request({ worldVersion: 2 }), changedProfiles);

    expect(changedPlan.execution.geometry.nominalLengthPx).toBe(34);
    expect(executeCastPlan(changedPlan, {
      currentMp: 24,
      currentWorldVersion: 2,
      idempotencyKey: "cast.changed-profile",
    })).toMatchObject({
      accepted: false,
      mpCharge: 0,
      rejectionCode: "untrusted_cast_plan",
    });
  });

  it("rejects a frozen plan forged with a former hard-coded MP quote", () => {
    const plan = compileTeloCast(request({ worldVersion: 2 }));
    const forgedLegacyQuote = Object.freeze({ ...plan, activationMpRequired: 6 });

    expect(executeCastPlan(forgedLegacyQuote, {
      currentMp: 24,
      currentWorldVersion: 2,
      idempotencyKey: "cast.legacy-hardcode",
    })).toMatchObject({
      accepted: false,
      mpCharge: 0,
      rejectionCode: "untrusted_cast_plan",
    });
  });

  it("rejects a forged prior commit instead of restoring its state", () => {
    const plan = compileTeloCast(request({ currentMp: 24, worldVersion: 2 }));
    const decision = executeCastPlan(plan, {
      currentMp: 19,
      currentWorldVersion: 3,
      idempotencyKey: "cast.pure.forged-prior",
      priorCommit: {
        planId: plan.planId,
        idempotencyKey: "cast.pure.forged-prior",
        mpCharge: -5,
        snapshot: { mp: 29, worldVersion: 99 },
      },
    });

    expect(decision).toMatchObject({
      accepted: false,
      duplicate: false,
      shouldApplyWorldMutation: false,
      mpCharge: 0,
      rejectionCode: "idempotency_payload_conflict",
      nextSnapshot: { mp: 19, worldVersion: 3 },
    });
  });

  it("returns a duplicate without authorizing another world mutation", () => {
    const plan = compileTeloCast(request({ worldVersion: 2 }));
    const decision = executeCastPlan(plan, {
      currentMp: 19,
      currentWorldVersion: 3,
      idempotencyKey: "cast.pure.duplicate",
      priorCommit: {
        planId: plan.planId,
        idempotencyKey: "cast.pure.duplicate",
        mpCharge: 5,
        snapshot: { mp: 19, worldVersion: 3 },
      },
    });

    expect(decision).toMatchObject({
      accepted: true,
      duplicate: true,
      shouldApplyWorldMutation: false,
      mpCharge: 0,
      nextSnapshot: { mp: 19, worldVersion: 3 },
    });
  });
});

describe("CastExecutionLedger", () => {
  it("applies a plan and charges MP exactly once for an idempotent key", () => {
    const plan = createTeloCastPlan(request({ worldVersion: 0 }));
    const ledger = new CastExecutionLedger(24, 0);
    const mutate = vi.fn(() => true);

    const first = ledger.commit(plan, "cast.tx.1", mutate);
    const duplicate = ledger.commit(plan, "cast.tx.1", mutate);

    expect(first).toMatchObject({
      committed: true,
      duplicate: false,
      mpCharge: 5,
      snapshot: { mp: 19, worldVersion: 1 },
    });
    expect(duplicate).toMatchObject({
      committed: true,
      duplicate: true,
      mpCharge: 0,
      snapshot: { mp: 19, worldVersion: 1 },
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(ledger.snapshot()).toEqual({ mp: 19, worldVersion: 1 });
  });

  it("returns the current ledger snapshot when an old cast key is replayed", () => {
    const plan = createTeloCastPlan(request({ worldVersion: 0 }));
    const ledger = new CastExecutionLedger(24, 0, 30);
    ledger.commit(plan, "cast.tx.current-snapshot", () => true);
    ledger.applyMpRecovery({
      schema: "cistern.mp-recovery.v0.1",
      source: "natural",
      recoveryId: "natural.after-cast",
      amountPolicy: { kind: "fixed", amountMp: 3 },
      capPolicy: { kind: "max_mp" },
      answerAccepted: null,
      evidenceEligible: null,
    });
    ledger.advanceWorldVersion();

    const duplicate = ledger.commit(plan, "cast.tx.current-snapshot", () => {
      throw new Error("duplicate must not mutate the world");
    });

    expect(duplicate).toMatchObject({
      committed: true,
      duplicate: true,
      planId: plan.planId,
      idempotencyKey: "cast.tx.current-snapshot",
      mpCharge: 0,
      snapshot: { mp: 22, worldVersion: 2 },
      rejectionCode: null,
    });
    expect(ledger.snapshot()).toEqual({ mp: 22, worldVersion: 2 });
  });

  it("invalidates previews when external physics advances the world version", () => {
    const plan = compileTeloCast(request({ worldVersion: 0 }));
    const ledger = new CastExecutionLedger(24, 0);
    const mutate = vi.fn(() => true);

    expect(ledger.advanceWorldVersion()).toEqual({ mp: 24, worldVersion: 1 });
    const result = ledger.commit(plan, "cast.tx.after-physics", mutate);

    expect(result).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "world_version_mismatch",
      snapshot: { mp: 24, worldVersion: 1 },
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("synchronizes to a monotonic authoritative worker version", () => {
    const ledger = new CastExecutionLedger(24, 2);

    expect(ledger.synchronizeWorldVersion(8)).toEqual({ mp: 24, worldVersion: 8 });
    expect(() => ledger.synchronizeWorldVersion(7)).toThrow(/monotonic/);
    expect(() => ledger.synchronizeWorldVersion(1.5)).toThrow(/monotonic/);
    expect(ledger.snapshot()).toEqual({ mp: 24, worldVersion: 8 });
  });

  it("rejects a conflicting payload that reuses an idempotency key", () => {
    const firstPlan = createTeloCastPlan(request({ worldVersion: 0 }));
    const secondPlan = createTeloCastPlan(request({
      canonicalAst: ast("word.lili"),
      worldVersion: 0,
    }));
    const ledger = new CastExecutionLedger(24, 0);
    ledger.commit(firstPlan, "cast.tx.shared", () => true);

    const conflict = ledger.commit(secondPlan, "cast.tx.shared", () => true);

    expect(conflict).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "idempotency_payload_conflict",
      snapshot: { mp: 19, worldVersion: 1 },
    });
  });

  it("rejects stale plans without mutating the world or charging MP", () => {
    const stalePlan = createTeloCastPlan(request({ worldVersion: 2 }));
    const ledger = new CastExecutionLedger(24, 3);
    const mutate = vi.fn(() => true);

    const result = ledger.commit(stalePlan, "cast.tx.stale", mutate);

    expect(result).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "world_version_mismatch",
      snapshot: { mp: 24, worldVersion: 3 },
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rechecks available MP at commit time and never silently downgrades", () => {
    const longPlan = createTeloCastPlan(request({
      canonicalAst: ast("word.suli"),
      currentMp: 24,
      worldVersion: 0,
    }));
    const ledger = new CastExecutionLedger(9, 0);
    const mutate = vi.fn(() => true);

    const result = ledger.commit(longPlan, "cast.tx.no-mp", mutate);

    expect(result).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "requested_class_requires_more_mp",
      snapshot: { mp: 9, worldVersion: 0 },
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects forged plans without calling the world mutation", () => {
    const plan = compileTeloCast(request({ worldVersion: 0 }));
    const forged = Object.freeze({ ...plan, activationMpRequired: -5 });
    const ledger = new CastExecutionLedger(24, 0);
    const mutate = vi.fn(() => true);

    const result = ledger.commit(forged, "cast.tx.forged", mutate);

    expect(result).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "untrusted_cast_plan",
      snapshot: { mp: 24, worldVersion: 0 },
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("blocks callback reentry and catches callback failures without charging", () => {
    const plan = compileTeloCast(request({ worldVersion: 0 }));
    const ledger = new CastExecutionLedger(24, 0);
    let nestedRejection: string | null | undefined;
    const outer = ledger.commit(plan, "cast.tx.outer", () => {
      nestedRejection = ledger.commit(plan, "cast.tx.nested", () => true).rejectionCode;
      return true;
    });

    expect(nestedRejection).toBe("transaction_in_progress");
    expect(outer).toMatchObject({ committed: true, mpCharge: 5, snapshot: { mp: 19, worldVersion: 1 } });

    const nextPlan = compileTeloCast(request({ currentMp: 19, worldVersion: 1 }));
    const failed = ledger.commit(nextPlan, "cast.tx.throw", () => {
      throw new Error("simulated worker failure");
    });
    expect(failed).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "world_mutation_failed",
      snapshot: { mp: 19, worldVersion: 1 },
    });
    expect(ledger.commit(nextPlan, "cast.tx.throw", () => true)).toMatchObject({
      committed: true,
      mpCharge: 5,
      snapshot: { mp: 14, worldVersion: 2 },
    });
  });

  it("applies recovery idempotently without advancing the physical world version", () => {
    const ledger = new CastExecutionLedger(18, 4, 26);
    const proposal = {
      schema: "cistern.mp-recovery.v0.1",
      source: "meditation",
      recoveryId: "meditation.wrong-answer",
      amountPolicy: { kind: "fixed", amountMp: 3 },
      capPolicy: { kind: "max_mp" },
      answerAccepted: false,
      evidenceEligible: false,
    } as const;

    const first = ledger.applyMpRecovery(proposal);
    const duplicate = ledger.applyMpRecovery(proposal);
    const conflict = ledger.applyMpRecovery({
      ...proposal,
      amountPolicy: { kind: "fixed", amountMp: 4 },
    });

    expect(first).toMatchObject({ reason: "applied", restoredMp: 3, afterMp: 21 });
    expect(duplicate).toMatchObject({ reason: "duplicate", duplicate: true, restoredMp: 0, afterMp: 21 });
    expect(conflict).toMatchObject({ reason: "idempotency_conflict", restoredMp: 0, afterMp: 21 });
    expect(ledger.mpSnapshot()).toEqual({ mp: 21, currentMp: 21, maxMp: 26, worldVersion: 4 });
  });

  it.each([
    [10, 4, 14, "applied"],
    [20, 0.5, 20.5, "applied"],
    [24, 0, 24, "at_cap"],
  ] as const)("evaluates checkpoint recovery against authoritative max from %s MP", (initial, restored, after, reason) => {
    const ledger = new CastExecutionLedger(initial, 7, 26);
    const receipt = ledger.applyMpRecovery({
      schema: "cistern.mp-recovery.v0.1",
      source: "checkpoint",
      recoveryId: `checkpoint.${initial}`,
      amountPolicy: {
        kind: "max_of_fixed_and_max_fraction",
        minimumMp: 3,
        maxMpFraction: 0.15,
        quantum: 0.5,
      },
      capPolicy: { kind: "max_mp_fraction", maxMpFraction: 0.8, quantum: 0.5 },
      answerAccepted: null,
      evidenceEligible: null,
    });

    expect(receipt).toMatchObject({ reason, restoredMp: restored, afterMp: after, maxMp: 26 });
    expect(ledger.snapshot().worldVersion).toBe(7);
  });

  it("canonicalizes recovery IDs and ignores policy object insertion order", () => {
    const ledger = new CastExecutionLedger(10, 3, 26);
    const first = ledger.applyMpRecovery({
      schema: "cistern.mp-recovery.v0.1",
      source: "checkpoint",
      recoveryId: "  checkpoint.canonical.1  ",
      amountPolicy: {
        kind: "max_of_fixed_and_max_fraction",
        minimumMp: 3,
        maxMpFraction: 0.15,
        quantum: 0.5,
      },
      capPolicy: { kind: "max_mp_fraction", maxMpFraction: 0.8, quantum: 0.5 },
      answerAccepted: null,
      evidenceEligible: null,
    });
    const duplicate = ledger.applyMpRecovery({
      schema: "cistern.mp-recovery.v0.1",
      source: "checkpoint",
      recoveryId: "checkpoint.canonical.1",
      amountPolicy: {
        quantum: 0.5,
        maxMpFraction: 0.15,
        minimumMp: 3,
        kind: "max_of_fixed_and_max_fraction",
      },
      capPolicy: { quantum: 0.5, maxMpFraction: 0.8, kind: "max_mp_fraction" },
      answerAccepted: null,
      evidenceEligible: null,
    });

    expect(first).toMatchObject({ recoveryId: "checkpoint.canonical.1", restoredMp: 4, afterMp: 14 });
    expect(duplicate).toMatchObject({
      recoveryId: "checkpoint.canonical.1",
      reason: "duplicate",
      duplicate: true,
      restoredMp: 0,
      afterMp: 14,
    });
    expect(ledger.snapshot()).toEqual({ mp: 14, worldVersion: 3 });
  });

  it("rejects invalid recovery proposals and invalid ledger maxima", () => {
    expect(() => new CastExecutionLedger(27, 0, 26)).toThrow(/maxMp/);
    const ledger = new CastExecutionLedger(10, 0, 26);
    expect(() => ledger.applyMpRecovery({
      schema: "cistern.mp-recovery.v0.1",
      source: "natural",
      recoveryId: "natural.invalid",
      amountPolicy: { kind: "fixed", amountMp: Number.NaN },
      capPolicy: { kind: "max_mp" },
      answerAccepted: null,
      evidenceEligible: null,
    })).toThrow(/finite/);
    expect(ledger.snapshot()).toEqual({ mp: 10, worldVersion: 0 });
  });

  it("does not charge or advance the version when the world rejects mutation", () => {
    const plan = createTeloCastPlan(request({ worldVersion: 0 }));
    const ledger = new CastExecutionLedger(24, 0);

    const result = ledger.commit(plan, "cast.tx.rejected", () => false);

    expect(result).toMatchObject({
      committed: false,
      mpCharge: 0,
      rejectionCode: "world_mutation_rejected",
      snapshot: { mp: 24, worldVersion: 0 },
    });
  });
});
