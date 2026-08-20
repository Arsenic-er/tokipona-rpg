export interface RuntimeSpeechlessAudioPolicy {
  readonly spokenPronunciationRequired: false;
  readonly dialogueFeedback: "procedural_nonsemantic";
  readonly progressMayDependOnAudio: false;
  readonly captionsRequired: true;
}

const POLICY_KEYS = [
  "spokenPronunciationRequired",
  "dialogueFeedback",
  "progressMayDependOnAudio",
  "captionsRequired",
] as const;

export function readRuntimeSpeechlessAudioPolicy(
  value: unknown,
  label: string,
): RuntimeSpeechlessAudioPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const policy = value as Record<string, unknown>;
  const keys = Object.keys(policy);
  if (keys.length !== POLICY_KEYS.length ||
      POLICY_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(policy, key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  if (policy.spokenPronunciationRequired !== false ||
      policy.dialogueFeedback !== "procedural_nonsemantic" ||
      policy.progressMayDependOnAudio !== false ||
      policy.captionsRequired !== true) {
    throw new Error(`${label} violates the speechless audio policy`);
  }
  return Object.freeze({
    spokenPronunciationRequired: false,
    dialogueFeedback: "procedural_nonsemantic",
    progressMayDependOnAudio: false,
    captionsRequired: true,
  });
}
