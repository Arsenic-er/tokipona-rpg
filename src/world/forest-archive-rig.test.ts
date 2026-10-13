import {it,expect} from 'vitest';
import {archiveRigFrame as frame,advanceArchiveRig as advance,appendArchiveRig as append,validateArchiveRig,canOperateArchiveRig,ARCHIVE_RIG,type ArchiveRigState} from './forest-archive-rig';
const fresh=():ArchiveRigState=>({version:1,age:0,events:[]});
const run=(s:ArchiveRigState,n=360)=>{for(let i=0;i<n;i++)advance(s);return s;};
it('motion rotates a selector over time; it does not teleport the carrier or supply traction',()=>{
 const s=append(fresh(),'motion',-1);expect(frame(s).gear).toBe(1);run(s,23);expect(frame(s).gear).toBe(1);run(s,1);
 expect(frame(s)).toMatchObject({gear:-1,position:64,cam:-24,remaining:0,work:0});expect(s.age).toBe(24);
 run(s);expect(s.age).toBe(24);
});
it('finite input and selector cooperate, then the receiver brake retains unused charge',()=>{
 let s=append(fresh(),'motion',-1);run(s,24);s=append(s,'energy');run(s);
 const f=frame(s);expect(f).toMatchObject({position:16,delivered:true,working:false,remaining:256,magicInput:1280,handInput:0,work:768,loss:256});
 expect(s.age).toBe(152);const before=structuredClone(s);run(s);expect(s).toEqual(before);
});
it('wrong direction dissipates finite input at the stop; manual recovery remains under sixty seconds',()=>{
 let s=append(fresh(),'energy');run(s);expect(frame(s)).toMatchObject({position:64,remaining:0,loss:1280,delivered:false});
 s=append(s,'motion',1);run(s);expect(frame(s).gear).toBe(1);s=append(s,'winch');const before=s.age;run(s);
 expect(frame(s)).toMatchObject({delivered:true,handInput:1024,magicInput:1280,work:768,loss:1536});
 expect(s.age-before).toBe(128);expect(s.age).toBeLessThanOrEqual(ARCHIVE_RIG.maxTicks);
});
it('all-tool route supplies actual hand work without magic, and takes only one finite run',()=>{
 const s=append(fresh(),'winch');run(s);expect(frame(s)).toMatchObject({delivered:true,magicInput:0,handInput:1024,remaining:0,work:768,loss:256});
 expect(canOperateArchiveRig(s,'winch')).toBe(false);expect(()=>append(s,'energy')).toThrow();
});
it('same-tick input order is deterministic; a manual override safely stops an in-flight selector',()=>{
 let a=append(append(fresh(),'energy'),'motion',-1),b=structuredClone(a);run(a);run(b);expect(a).toEqual(b);expect(frame(a).delivered).toBe(true);
 let c=append(fresh(),'motion',1);run(c,10);c=append(c,'winch');run(c);expect(frame(c)).toMatchObject({delivered:true,gear:-1,selectorRemaining:0});
});
it('every running frame conserves drive energy and survives reconstruction',()=>{
 let s=append(append(fresh(),'motion',-1),'energy');
 for(let i=0;i<360;i++){const f=frame(s);expect(f.magicInput+f.handInput).toBe(f.remaining+f.work+f.loss);
  expect(frame(structuredClone(s))).toEqual(f);advance(s);}
 expect(frame(s).delivered).toBe(true);
});
it.each([null,{version:1,age:1,events:[]},{version:1,age:0,events:[{at:0,kind:'motion'}]},
 {version:1,age:0,events:[{at:0,kind:'energy',direction:1}]},{version:1,age:361,events:[]},
 {version:1,age:0,events:[{at:0,kind:'energy'},{at:0,kind:'energy'}]},
 {version:1,age:0,events:[{at:0,kind:'winch'},{at:0,kind:'motion',direction:-1}]}])('rejects malformed, fabricated idle time or repeated inputs %#',s=>{
 expect(()=>validateArchiveRig(s as never)).toThrow(/档案取回架/);
});
