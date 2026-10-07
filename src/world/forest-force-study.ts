/** A guarded, waterwheel-powered spring gauge, not a player spell or a source of water/material. */
export const FORCE_STUDY = { sampleTicks: 120, contrastTicks: 240, mass: .02, damping: .3, spring: 1,
  lowForce: 6, highForce: 18, x: 376, y: 370, width: 65, height: 25 } as const;
export interface ForceStudyState { version: 1; run: 'contrast' | 'trial'; age: number }
export interface ForceStudyView { position: number; velocity: number; input: number; phase: 'low' | 'high'; finished: boolean }
const step = (p: number, v: number, force: number): [number, number] => {
  const acceleration = (force - FORCE_STUDY.spring * p - FORCE_STUDY.damping * v) / FORCE_STUDY.mass;
  const nextV = v + acceleration / 60;
  return [p + nextV / 60, nextV];
};
function frames(run: ForceStudyState['run']): readonly ForceStudyView[] {
  let position = run === 'trial' ? FORCE_STUDY.lowForce / FORCE_STUDY.spring : 0, velocity = 0;
  const end = run === 'contrast' ? FORCE_STUDY.contrastTicks : FORCE_STUDY.sampleTicks;
  const result: ForceStudyView[] = [];
  for (let age = 0; age <= end; age++) {
    const phase = run === 'contrast' && age < FORCE_STUDY.sampleTicks ? 'low' : 'high';
    const input = phase === 'low' ? FORCE_STUDY.lowForce : FORCE_STUDY.highForce;
    result.push(Object.freeze({ position, velocity, input, phase, finished: age === end }));
    [position, velocity] = step(position, velocity, input);
  }
  return Object.freeze(result);
}
const CONTRAST = frames('contrast'), TRIAL = frames('trial');
export const emptyForceStudy = (): ForceStudyState => ({ version: 1, run: 'contrast', age: 0 });
export function validateForceStudy(s: ForceStudyState): void {
  if (!s || s.version !== 1 || !['contrast','trial'].includes(s.run) || !Number.isInteger(s.age) || s.age < 0 ||
    s.age > (s.run === 'contrast' ? FORCE_STUDY.contrastTicks : FORCE_STUDY.sampleTicks)) throw Error('测力器存档无效');
}
export function forceStudyView(s: ForceStudyState): ForceStudyView {
  validateForceStudy(s); return (s.run === 'contrast' ? CONTRAST : TRIAL)[s.age]!;
}
export function advanceForceStudy(s: ForceStudyState): ForceStudyView {
  validateForceStudy(s);
  const end = s.run === 'contrast' ? FORCE_STUDY.contrastTicks : FORCE_STUDY.sampleTicks;
  s.age = Math.min(end, s.age + 1); return forceStudyView(s);
}
export function forceContrastVerified(s: ForceStudyState): boolean {
  const last = forceStudyView(s), baseline = CONTRAST[FORCE_STUDY.sampleTicks]!;
  return s.run === 'contrast' && last.finished && baseline.position > 5.9 && baseline.position < 6.1 &&
    last.position - baseline.position > 11.8 && Math.abs(last.velocity) < .05;
}
export function forceTrialVerified(s: ForceStudyState): boolean {
  const v = forceStudyView(s);
  return s.run === 'trial' && v.finished && v.position > 17.9 && v.position < 18.1 && Math.abs(v.velocity) < .05;
}
/** Free word recall plus a separate physical prediction: no word menu, automatic completion or partial spelling. */
export function parseForcePrediction(choice: string): boolean {
  return choice.normalize('NFKC').trim().toLowerCase() === 'force:predict:wawa:more';
}
