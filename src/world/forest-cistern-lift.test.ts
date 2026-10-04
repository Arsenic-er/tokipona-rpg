import {describe,it,expect} from 'vitest';
import {emptyCisternLift,beginCisternLift,stepCisternLift,liftDeck,liftCarriesPlayer,validateCisternLift,type CisternLiftState} from './forest-cistern-lift';
import {cisternRoomCollides,cisternRoomSolid} from './forest-cistern-room';
import {intersects} from '../runtime/geometry';
import type {PlayerMotionState} from '../runtime/player-motion';
const solid=(b:Parameters<typeof cisternRoomCollides>[0])=>cisternRoomCollides(b,true,true);
const player=(x:number,y:number):PlayerMotionState=>({x,y,velocityX:0,velocityY:0,grounded:true});
describe('cistern lift finite safe motion',()=>{
  it.each(['top','bottom'] as const)('boards, rides and leaves at %s without crossing terrain',to=>{
    let s:CisternLiftState={...emptyCisternLift(),to:to==='top'?'bottom':'top',y:to==='top'?352:128};
    let p=to==='top'?player(442,338):player(372,114);s=beginCisternLift(s,to==='top'?'bottom':'top');
    let ticks=0;
    while(s.mode!=='idle'&&ticks++<600){
      validateCisternLift(s,p);const next=stepCisternLift(s,p,solid);expect(next.lift.blocked).toBe(false);
      expect(Math.hypot(next.player.x-p.x,next.player.y-p.y)).toBeLessThanOrEqual(64/60+.0001);
      expect(Math.abs(next.lift.y-s.y)).toBeLessThanOrEqual(64/60+.0001);
      expect(solid({...next.player,width:12,height:14})).toBe(false);
      expect(intersects({...next.player,width:12,height:14},liftDeck(next.lift))).toBe(false);
      s=next.lift;p=next.player;
    }
    expect(s.mode).toBe('idle');expect(s.to).toBe(to);expect(p.y).toBe(to==='top'?114:338);
    expect(p.x).toBe(to==='top'?372:442);
  });
  it.each(['top','bottom'] as const)('accepts the reachable %s station interaction range',from=>{
    const y=from==='top'?128:352,target=from==='top'?376:458;
    for(const dx of [-30,0,30])for(const dy of [-28,-14,0]){
      let p=player(target-6+dx,y-14+dy);
      if(solid({...p,width:12,height:14}))continue;
      let s=beginCisternLift({...emptyCisternLift(),y,to:from},from);
      for(let i=0;i<600&&s.mode!=='idle';i++){
        const next=stepCisternLift(s,p,solid);
        expect(next.lift.blocked).toBe(false);expect(solid({...next.player,width:12,height:14})).toBe(false);
        s=next.lift;p=next.player;
      }
      expect(s.mode).toBe('idle');expect(p.y).toBe(from==='top'?338:114);
    }
  });
  it('stops under a non-riding occupant instead of crushing them, then resumes',()=>{
    let s:CisternLiftState={version:1,y:180,to:'top',mode:'call',blocked:false},p=player(420,150);
    for(let t=0;t<120&&!s.blocked;t++){s=stepCisternLift(s,p,solid).lift;expect(intersects(liftDeck(s),{...p,width:12,height:14})).toBe(false);}
    expect(s.blocked).toBe(true);const y=s.y;expect(stepCisternLift(s,p,solid).lift.y).toBe(y);
    const moved=stepCisternLift(s,player(370,114),solid);expect(moved.lift.blocked).toBe(false);expect(moved.lift.y).toBeLessThan(y);
  });
  it('stops a descending deck before an occupant below it',()=>{
    let s:CisternLiftState={version:1,y:280,to:'bottom',mode:'call',blocked:false};const p=player(420,338);
    for(let t=0;t<120&&!s.blocked;t++){s=stepCisternLift(s,p,solid).lift;expect(intersects(liftDeck(s),{...p,width:12,height:14})).toBe(false);}
    expect(s.blocked).toBe(true);expect(s.y+8).toBeLessThanOrEqual(p.y);
  });
  it('checks the rider head as well as the platform swept volume',()=>{
    const s:CisternLiftState={version:1,y:250,to:'top',mode:'ride',blocked:false},p=player(424,236);
    const step=stepCisternLift(s,p,b=>solid(b)||intersects(b,{x:420,y:234,width:20,height:2}));
    expect(step.lift.y).toBe(s.y);expect(step.lift.blocked).toBe(true);expect(step.player.y).toBe(p.y);
  });
  it('uses a real opening only after activation and rejects inconsistent saves',()=>{
    expect(cisternRoomSolid(420,130,true)).toBe(true);expect(cisternRoomSolid(420,130,true,true)).toBe(false);
    expect(cisternRoomSolid(390,130,true,true)).toBe(true);
    expect(()=>validateCisternLift({...emptyCisternLift(),mode:'ride'},player(300,338))).toThrow();
    expect(()=>validateCisternLift({...emptyCisternLift(),y:200},player(300,338))).toThrow();
    expect(liftCarriesPlayer({...emptyCisternLift(),mode:'call'})).toBe(false);
  });
});
