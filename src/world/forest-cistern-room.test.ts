import {describe,it,expect} from 'vitest';
import {CISTERN_ROUTES,cisternRoomCollides,cisternRoomSolid,stepCisternClimb,type CisternClimb} from './forest-cistern-room';
import {ForestCartography,MAP_UNKNOWN} from './forest-cartography';
import type {PlayerMotionState} from '../runtime/player-motion';
import {EPISODE_TARGETS} from '../game/forest-episode';
describe('walkable cistern room geometry',()=>{
  it.each(Object.keys(CISTERN_ROUTES) as (keyof typeof CISTERN_ROUTES)[])('%s follows a collision-free route with finite-speed movement',route=>{
    const first=CISTERN_ROUTES[route][0];let p:PlayerMotionState={...first,velocityX:0,velocityY:0,grounded:true},c:CisternClimb|undefined={route,leg:0};
    let ticks=0;while(c&&ticks<600){
      const next=stepCisternClimb(p,c,true);
      expect(Math.hypot(next.player.x-p.x,next.player.y-p.y)).toBeLessThanOrEqual(64/60+.0001);
      expect(cisternRoomCollides({...next.player,width:12,height:14},true)).toBe(false);
      p=next.player;c=next.climb;ticks++;
    }
    expect(c).toBeUndefined();expect(p).toMatchObject(CISTERN_ROUTES[route].at(-1)!);expect(p.grounded).toBe(true);
  });
  it.each(Object.keys(CISTERN_ROUTES) as (keyof typeof CISTERN_ROUTES)[])('%s accepts the entire visible interaction reach without a boarding crash',route=>{
    const target=EPISODE_TARGETS.cistern.find(t=>t.id===route)!;
    for(const dx of [-30,0,30])for(const dy of [-28,-14,0,14,28]){
      let p:PlayerMotionState={x:target.x-6+dx,y:target.y!-14+dy,velocityX:0,velocityY:0,grounded:dy===0};
      if(cisternRoomCollides({...p,width:12,height:14},true))continue;
      let c:CisternClimb|undefined={route,leg:0};
      // Approaching from beneath a landing must not board through its solid floor.
      if(dy>0){expect(()=>stepCisternClimb(p,c!,true)).toThrow('起点');continue;}
      for(let ticks=0;c&&ticks<600;ticks++){
        let next;
        try{next=stepCisternClimb(p,c,true);}
        catch(error){throw Error(route+' dx='+dx+' dy='+dy+' p='+JSON.stringify(p)+' climb='+JSON.stringify(c)+' '+String(error));}
        p=next.player;c=next.climb;
        expect(cisternRoomCollides({...p,width:12,height:14},true)).toBe(false);
      }
      expect(c).toBeUndefined();expect(p).toMatchObject(CISTERN_ROUTES[route].at(-1)!);
    }
  });
  it('uses the same cell geometry for the player and fog, with a real gate on the western shaft',()=>{
    for(const open of [false,true])for(let y=0;y<768;y+=11)for(let x=0;x<480;x+=11)
      expect(cisternRoomCollides({x,y,width:1,height:1},open)).toBe(cisternRoomSolid(x,y,open));
    expect(cisternRoomCollides({x:50,y:368,width:12,height:14},false)).toBe(true);
    expect(()=>stepCisternClimb({x:50,y:530,velocityX:0,velocityY:0,grounded:true},{route:'west-up',leg:0},false)).toThrow();
    const map=new ForestCartography();map.observe('cistern',{x:58,y:728},(x,y)=>cisternRoomSolid(x,y,false)?4:0);
    expect(map.at('cistern',350,352)).toBe(MAP_UNKNOWN);expect(ForestCartography.restore(map.toSave()).toSave()).toEqual(map.toSave());
  });
});
