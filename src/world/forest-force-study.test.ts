import {describe,it,expect} from 'vitest';
import {FORCE_STUDY,emptyForceStudy,advanceForceStudy,forceStudyView,forceContrastVerified,forceTrialVerified,
  validateForceStudy,parseForcePrediction,type ForceStudyState} from './forest-force-study';
describe('inert spring force study',()=>{
  it('integrates two loads in the same direction rather than jumping directly to a result',()=>{
    const s=emptyForceStudy();expect(forceStudyView(s).position).toBe(0);advanceForceStudy(s);
    expect(forceStudyView(s).position).toBeGreaterThan(0);expect(forceStudyView(s).position).toBeLessThan(1);
    while(s.age<120)advanceForceStudy(s);const low=forceStudyView(s);
    expect(low.position).toBeCloseTo(6,2);expect(forceContrastVerified(s)).toBe(false);
    while(s.age<240)advanceForceStudy(s);const high=forceStudyView(s);
    expect(high.position).toBeCloseTo(18,2);expect(high.position).toBeGreaterThan(low.position);
    expect(forceContrastVerified(s)).toBe(true);expect(forceTrialVerified(s)).toBe(false);
    const done=structuredClone(s);advanceForceStudy(s);expect(s).toEqual(done);
  });
  it('requires a full stable trial and restores its deterministic physical view',()=>{
    const a:ForceStudyState={version:1,run:'trial',age:0};
    for(let i=0;i<60;i++)advanceForceStudy(a);const b=structuredClone(a);
    expect(forceStudyView(b)).toEqual(forceStudyView(a));expect(forceTrialVerified(a)).toBe(false);
    for(let i=0;i<60;i++){advanceForceStudy(a);advanceForceStudy(b);}
    expect(forceStudyView(a)).toEqual(forceStudyView(b));expect(forceTrialVerified(a)).toBe(true);
  });
  it('rejects malformed timelines and accepts only the word plus matching prediction',()=>{
    for(const s of [{version:2,run:'contrast',age:0},{version:1,run:'fake',age:0},{version:1,run:'trial',age:121},
      {version:1,run:'contrast',age:-1},{version:1,run:'contrast',age:1.5},{version:1,run:'contrast',age:NaN}])
      expect(()=>validateForceStudy(s as ForceStudyState)).toThrow();
    expect(parseForcePrediction('force:predict:WAWA:more')).toBe(true);
    for(const s of ['force:predict:telo:more','force:predict:wawa:less','force:predict:wawa:reverse','force:predict:wawa suli:more','force:predict:wawa:more:more'])
      expect(parseForcePrediction(s)).toBe(false);
  });
  it('does not expose mutable cached frames',()=>{
    expect(Object.isFrozen(forceStudyView(emptyForceStudy()))).toBe(true);
    expect(forceStudyView({version:1,run:'trial',age:FORCE_STUDY.sampleTicks}).input).toBe(FORCE_STUDY.highForce);
  });
});
