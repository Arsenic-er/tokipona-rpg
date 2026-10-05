import {describe,it,expect} from 'vitest';
import {emptyWetlandMigration,advanceWetlandMigration,validateWetlandMigration,migrationBodies,
  migrationSettled,wetlandGround,orderNodeSolid} from './forest-wetland-migration';
import {intersects} from '../runtime/geometry';
const controls={cleared:true,adultAlive:true,youngAlive:true};
const safe={x:96,y:338,width:12,height:14};
describe('wetland migration geometry and state machine',()=>{
  it('does not complete merely because a rope was pulled or time passed beside the animals',()=>{
    const s=emptyWetlandMigration();
    for(let i=0;i<900;i++)advanceWetlandMigration(s,controls,{...safe,x:248,y:344});
    expect(s.mode).toBe('warning');expect(s.adultX).toBe(330);expect(migrationSettled(s)).toBe(false);
    for(let i=0;i<900;i++)advanceWetlandMigration(s,{...controls,cleared:false},safe);
    expect(s.adultX).toBe(330);validateWetlandMigration(s,{...controls,cleared:false});
  });
  it('walks both living animals to the habitat without tunnelling through the shared terrain',()=>{
    const s=emptyWetlandMigration();
    for(let i=0;i<720;i++){
      const previous=s.adultX;advanceWetlandMigration(s,controls,safe);
      expect(s.adultX-previous).toBeLessThanOrEqual(.650001);
      for(const b of migrationBodies(s,controls)){
        expect(intersects(safe,b)).toBe(false);
        for(let x=Math.floor(b.x);x<Math.ceil(b.x+b.width);x++)expect(b.y+b.height).toBeLessThanOrEqual(wetlandGround(x));
      }
      validateWetlandMigration(s,controls);
    }
    expect(migrationSettled(s)).toBe(true);expect(s.adultX).toBe(688);expect(s.youngX).toBe(640);
    const {age:_,...pose}=s;advanceWetlandMigration(s,controls,safe);
    const {age:__,...after}=s;expect(after).toEqual(pose);
  });
  it('stops immediately if the player reoccupies the corridor, then resumes after retreat',()=>{
    const s=emptyWetlandMigration();for(let i=0;i<200;i++)advanceWetlandMigration(s,controls,safe);
    const x=s.adultX;
    for(let i=0;i<100;i++)advanceWetlandMigration(s,controls,{...safe,x:500,y:354});
    expect(s.adultX).toBe(x);expect(s.calm).toBe(0);
    for(let i=0;i<60;i++)advanceWetlandMigration(s,controls,safe);
    expect(s.adultX).toBeGreaterThan(x);
  });
  it('round-trips mid-migration deterministically',()=>{
    const a=emptyWetlandMigration();for(let i=0;i<200;i++)advanceWetlandMigration(a,controls,safe);
    const b=structuredClone(a);validateWetlandMigration(b,controls);
    for(let i=0;i<600;i++){advanceWetlandMigration(a,controls,safe);advanceWetlandMigration(b,controls,safe);}
    expect(a).toEqual(b);
  });
  it('never respawns a dead life or completes a missing-young peaceful route',()=>{
    const dead=emptyWetlandMigration();
    for(let i=0;i<900;i++)advanceWetlandMigration(dead,{...controls,adultAlive:false},safe);
    expect(dead.mode).toBe('dead');expect(migrationBodies(dead,{...controls,adultAlive:false})).toHaveLength(1);
    validateWetlandMigration(dead,{...controls,adultAlive:false});
    const missing=emptyWetlandMigration();
    for(let i=0;i<900;i++)advanceWetlandMigration(missing,{...controls,youngAlive:false},safe);
    expect(missing.adultX).toBe(330);expect(migrationSettled(missing)).toBe(false);
  });
  it('rejects impossible positions, premature arrival, revived state and unknown modes',()=>{
    for(const patch of [{adultX:900},{youngX:300},{age:-1},{calm:61},{mode:'teleported'},{mode:'resettling'},
      {adultX:688,youngX:640,mode:'resettling',age:10}]){
      expect(()=>validateWetlandMigration({...emptyWetlandMigration(),...patch} as any,controls)).toThrow();
    }
    expect(()=>validateWetlandMigration(emptyWetlandMigration(),{...controls,adultAlive:false})).toThrow();
  });
  it('keeps the archive ceiling, sidewalls and floor explicit',()=>{
    expect(orderNodeSolid(32,64)).toBe(false);expect(orderNodeSolid(32,63)).toBe(true);
    expect(orderNodeSolid(442,100)).toBe(true);expect(orderNodeSolid(5,100)).toBe(true);
    expect(orderNodeSolid(32,335)).toBe(false);expect(orderNodeSolid(32,336)).toBe(true);
  });
});
