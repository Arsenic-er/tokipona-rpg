export const SAFE_RANGE_TARGET_CLASSES = [
  "wood_dummy",
  "sandbag",
  "minecart",
  "hanging_stone",
] as const;

export type SafeRangeTargetClass = (typeof SAFE_RANGE_TARGET_CLASSES)[number];

export interface SafeRangeCanonicalAst {
  readonly subject_head: "word.telo";
  readonly command_particle: "o";
  readonly action: "word.tawa";
  readonly manner: "word.wawa";
}

export const SAFE_RANGE_CANONICAL_AST: SafeRangeCanonicalAst = Object.freeze({
  subject_head: "word.telo",
  command_particle: "o",
  action: "word.tawa",
  manner: "word.wawa",
});

export interface SafeRangeTargetProfile {
  readonly targetClass: SafeRangeTargetClass;
  readonly materialClass: string;
  readonly initialHp: number;
  readonly absorptionEu: number;
  readonly coupling: number;
}

export interface SafeRangePhysicsContract {
  readonly signatureId: string;
  readonly allowedSceneId: string;
  readonly capacity: Readonly<{
    minExpressionCapacityWords: number;
    minFocusSlots: number;
  }>;
  readonly mpQuotes: Readonly<{
    boundExistingWater: number;
    shapedWater: number;
  }>;
  readonly effect: Readonly<{
    phase: "liquid";
    massMu: number;
    kineticEu: number;
    speedBand: Readonly<{ min: number; max: number }>;
    solidDamageBonusHp: number;
    kineticEuPerHpAfterAbsorption: number;
  }>;
  readonly targets: Readonly<Record<SafeRangeTargetClass, SafeRangeTargetProfile>>;
}

export interface SafeRangeTargetBinding {
  readonly targetId: string;
  readonly targetClass: SafeRangeTargetClass;
  readonly currentHp: number;
}

export interface SafeRangeCompileInput {
  readonly permission: "granted" | "denied";
  readonly sceneId: string;
  readonly expressionCapacityWords: number;
  readonly focusSlots: number;
  readonly target: SafeRangeTargetBinding;
  readonly livingOverlap: boolean;
  readonly sweptLivingCollision: boolean;
  readonly useBoundExistingWater: boolean;
  readonly currentMp: number;
  readonly worldVersion: number;
  readonly promptLevel: number;
  readonly direction: Readonly<{ x: number; y: number }>;
}

export type SafeRangeCompileFailureReason =
  | "invalid_contract"
  | "permission_denied"
  | "wrong_scene"
  | "insufficient_expression_capacity"
  | "insufficient_focus_slots"
  | "invalid_target_binding"
  | "living_overlap"
  | "swept_living_collision"
  | "insufficient_mp"
  | "invalid_world_version"
  | "invalid_prompt_level"
  | "invalid_direction";

export interface SafeRangeDecisionMaterial {
  readonly signatureId: string;
  readonly worldVersion: number;
  readonly promptLevel: number;
  readonly sceneId: string;
  readonly targetId: string;
  readonly targetClass: SafeRangeTargetClass;
  readonly targetHp: number;
  readonly useBoundExistingWater: boolean;
  readonly quotedMp: 13 | 18;
  readonly ast: SafeRangeCanonicalAst;
  readonly direction: Readonly<{ x: number; y: number }>;
  readonly phase: "liquid";
  readonly massMu: 2;
  readonly kineticEu: 8;
}

export interface SafeRangePhysicsPreview {
  readonly decisionMaterial: SafeRangeDecisionMaterial;
  readonly quotedMp: 13 | 18;
  readonly availableMpAtCompile: number;
  readonly effect: Readonly<{
    phase: "liquid";
    massMu: 2;
    kineticEu: 8;
    speedBand: Readonly<{ min: number; max: number }>;
    solidDamageBonusHp: 0;
  }>;
  readonly targetProfile: SafeRangeTargetProfile;
}

export type SafeRangeCompileResult =
  | Readonly<{ ok: true; preview: SafeRangePhysicsPreview; chargedMp: 0; mutated: false }>
  | Readonly<{ ok: false; reason: SafeRangeCompileFailureReason; chargedMp: 0; mutated: false }>;

export interface SafeRangeEvidenceEligibility {
  readonly eligible: boolean;
  readonly promptLevel: number;
  readonly qualification: "H0" | "H1" | null;
}

export interface SafeRangeExecution {
  readonly remainingMp: number;
  readonly chargedMp: 13 | 18;
  readonly target: Readonly<{
    targetId: string;
    targetClass: SafeRangeTargetClass;
    materialClass: string;
    hpBefore: number;
    hpAfter: number;
    kineticHpLoss: number;
    destroyed: boolean;
  }>;
  readonly physics: Readonly<{
    phase: "liquid";
    massMu: 2;
    kineticEu: 8;
    coupledEu: number;
    absorbedEu: number;
    transferredEu: number;
    damageBearingEu: number;
    solidDamageBonusHp: 0;
  }>;
  readonly evidenceEligibility: SafeRangeEvidenceEligibility;
  readonly decisionMaterial: SafeRangeDecisionMaterial;
}

export type SafeRangeExecuteResult =
  | Readonly<{ executed: true; value: SafeRangeExecution }>
  | Readonly<{ executed: false; reason: "untrusted_plan" | "plan_already_executed" | "world_version_conflict" | "insufficient_mp" }>
;

const trustedPreviews = new WeakSet<object>();
const executedPreviews = new WeakSet<object>();

const finite = (value: number): boolean => Number.isFinite(value);
const count = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const nonempty = (value: string): boolean => value.trim().length > 0;
const targetClass = (value: unknown): value is SafeRangeTargetClass =>
  typeof value === "string" && (SAFE_RANGE_TARGET_CLASSES as readonly string[]).includes(value);

const validContract = (contract: SafeRangePhysicsContract): boolean => {
  if (contract.signatureId !== "attack.water.forceful_motion.v0.1" ||
      contract.allowedSceneId !== "scene.valley.safe_range" ||
      contract.capacity.minExpressionCapacityWords !== 4 || contract.capacity.minFocusSlots !== 4 ||
      contract.mpQuotes.boundExistingWater !== 13 || contract.mpQuotes.shapedWater !== 18 ||
      contract.effect.phase !== "liquid" || contract.effect.massMu !== 2 || contract.effect.kineticEu !== 8 ||
      contract.effect.solidDamageBonusHp !== 0 || contract.effect.kineticEuPerHpAfterAbsorption !== 4 ||
      !finite(contract.effect.speedBand.min) || !finite(contract.effect.speedBand.max) ||
      contract.effect.speedBand.min !== 3 || contract.effect.speedBand.max !== 5) return false;
  return SAFE_RANGE_TARGET_CLASSES.every((klass) => {
    const profile = contract.targets[klass];
    return profile?.targetClass === klass && nonempty(profile.materialClass) && count(profile.initialHp) && profile.initialHp > 0 &&
      finite(profile.absorptionEu) && profile.absorptionEu >= 0 &&
      finite(profile.coupling) && profile.coupling >= 0 && profile.coupling <= 1;
  });
};

const failure = (reason: SafeRangeCompileFailureReason): SafeRangeCompileResult =>
  Object.freeze({ ok: false, reason, chargedMp: 0, mutated: false });

const freezePreview = (preview: SafeRangePhysicsPreview): SafeRangePhysicsPreview => {
  Object.freeze(preview.decisionMaterial.direction);
  Object.freeze(preview.decisionMaterial);
  Object.freeze(preview.effect.speedBand);
  Object.freeze(preview.effect);
  Object.freeze(preview.targetProfile);
  return Object.freeze(preview);
};

export const compileSafeRangePhysics = (
  contract: SafeRangePhysicsContract,
  input: SafeRangeCompileInput,
): SafeRangeCompileResult => {
  if (!validContract(contract)) return failure("invalid_contract");
  if (input.permission !== "granted") return failure("permission_denied");
  if (input.sceneId !== contract.allowedSceneId) return failure("wrong_scene");
  if (!count(input.expressionCapacityWords) || input.expressionCapacityWords < 4) return failure("insufficient_expression_capacity");
  if (!count(input.focusSlots) || input.focusSlots < 4) return failure("insufficient_focus_slots");
  if (!targetClass(input.target.targetClass) || input.target.targetId !== input.target.targetClass ||
      !count(input.target.currentHp) || input.target.currentHp === 0 ||
      input.target.currentHp > contract.targets[input.target.targetClass].initialHp) {
    return failure("invalid_target_binding");
  }
  if (input.livingOverlap !== false) return failure("living_overlap");
  if (input.sweptLivingCollision !== false) return failure("swept_living_collision");
  const quotedMp = (input.useBoundExistingWater ? 13 : 18) as 13 | 18;
  if (!count(input.currentMp) || input.currentMp < quotedMp) return failure("insufficient_mp");
  if (!count(input.worldVersion)) return failure("invalid_world_version");
  if (!count(input.promptLevel)) return failure("invalid_prompt_level");
  const { x, y } = input.direction;
  if (!finite(x) || !finite(y) || (x === 0 && y === 0)) return failure("invalid_direction");
  const magnitude = Math.hypot(x, y);
  const direction = Object.freeze({ x: x / magnitude, y: y / magnitude });
  const authoredProfile = contract.targets[input.target.targetClass];
  const profile: SafeRangeTargetProfile = {
    targetClass: authoredProfile.targetClass,
    materialClass: authoredProfile.materialClass,
    initialHp: authoredProfile.initialHp,
    absorptionEu: authoredProfile.absorptionEu,
    coupling: authoredProfile.coupling,
  };
  const decisionMaterial: SafeRangeDecisionMaterial = {
    signatureId: contract.signatureId,
    worldVersion: input.worldVersion,
    promptLevel: input.promptLevel,
    sceneId: input.sceneId,
    targetId: input.target.targetId,
    targetClass: input.target.targetClass,
    targetHp: input.target.currentHp,
    useBoundExistingWater: input.useBoundExistingWater,
    quotedMp,
    ast: SAFE_RANGE_CANONICAL_AST,
    direction,
    phase: "liquid",
    massMu: 2,
    kineticEu: 8,
  };
  const preview = freezePreview({
    decisionMaterial,
    quotedMp,
    availableMpAtCompile: input.currentMp,
    effect: {
      phase: "liquid",
      massMu: 2,
      kineticEu: 8,
      speedBand: { min: contract.effect.speedBand.min, max: contract.effect.speedBand.max },
      solidDamageBonusHp: 0,
    },
    targetProfile: profile,
  });
  trustedPreviews.add(preview);
  return Object.freeze({ ok: true, preview, chargedMp: 0, mutated: false });
};

export const executeSafeRangePhysics = (
  preview: SafeRangePhysicsPreview,
  state: Readonly<{ worldVersion: number; currentMp: number }>,
): SafeRangeExecuteResult => {
  if (!trustedPreviews.has(preview)) return Object.freeze({ executed: false, reason: "untrusted_plan" });
  if (executedPreviews.has(preview)) return Object.freeze({ executed: false, reason: "plan_already_executed" });
  if (state.worldVersion !== preview.decisionMaterial.worldVersion) {
    return Object.freeze({ executed: false, reason: "world_version_conflict" });
  }
  if (!count(state.currentMp) || state.currentMp < preview.quotedMp) {
    return Object.freeze({ executed: false, reason: "insufficient_mp" });
  }
  executedPreviews.add(preview);
  const transferredEu = 8 * preview.targetProfile.coupling;
  const damageBearingEu = Math.max(0, transferredEu - preview.targetProfile.absorptionEu);
  const kineticHpLoss = Math.min(preview.decisionMaterial.targetHp, Math.floor(damageBearingEu / 4));
  const hpAfter = preview.decisionMaterial.targetHp - kineticHpLoss;
  const qualification = preview.decisionMaterial.promptLevel === 0 ? "H0" :
    preview.decisionMaterial.promptLevel === 1 ? "H1" : null;
  const value: SafeRangeExecution = {
    remainingMp: state.currentMp - preview.quotedMp,
    chargedMp: preview.quotedMp,
    target: {
      targetId: preview.decisionMaterial.targetId,
      targetClass: preview.decisionMaterial.targetClass,
      materialClass: preview.targetProfile.materialClass,
      hpBefore: preview.decisionMaterial.targetHp,
      hpAfter,
      kineticHpLoss,
      destroyed: hpAfter === 0,
    },
    physics: {
      phase: "liquid",
      massMu: 2,
      kineticEu: 8,
      coupledEu: transferredEu,
      absorbedEu: Math.min(transferredEu, preview.targetProfile.absorptionEu),
      transferredEu,
      damageBearingEu,
      solidDamageBonusHp: 0,
    },
    evidenceEligibility: {
      eligible: qualification !== null,
      promptLevel: preview.decisionMaterial.promptLevel,
      qualification,
    },
    decisionMaterial: preview.decisionMaterial,
  };
  Object.freeze(value.target);
  Object.freeze(value.physics);
  Object.freeze(value.evidenceEligibility);
  return Object.freeze({ executed: true, value: Object.freeze(value) });
};
