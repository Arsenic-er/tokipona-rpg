import { describe, expect, it, vi } from 'vitest';
import { ForestOpeningCreek } from './forest-opening-creek';
import { FOREST_MATERIAL } from './forest-chunk-stream';
import { Material } from '../sim/materials';
import { PrologueForestOpeningSession } from '../game/prologue-forest-opening';
import { initialForestBodies, pushForestBody, stepForestBody } from './forest-opening-body';
import { stepPlayerMotion } from '../runtime/player-motion';
import { ForestOpeningEmbers } from './forest-opening-embers';
import { PrologueFlowSession } from '../game/prologue-flow';

const pocket={x:1808,y:704,width:128,height:64};
function creek() {
  const world=new ForestOpeningCreek(pocket,undefined,true);
  world.bindTerrain((_x,y)=>y>=713?FOREST_MATERIAL.stone:FOREST_MATERIAL.air);
  return world;
}
function count(world:ForestOpeningCreek,material:Material) {
  return world.save().grid.material.filter(m=>m===material).length;
}
function advance(world:ForestOpeningCreek,from:number,to:number) {
  for(let tick=from;tick<=to;tick++) world.advance(tick);
}
function walkTo(session:PrologueForestOpeningSession,x:number,axis=1) {
  let previous=-Infinity,stuck=0,jumpTicks=0;
  for(let i=0;i<1600 && session.snapshot().runtime.spatial.player.position.x<x;i++) {
    const px=session.snapshot().runtime.spatial.player.position.x;
    stuck=px<previous+.05?stuck+1:0; previous=px;
    const current=session.snapshot().runtime, player=current.spatial.player;
    const obstacleAhead=[current.obstacle.stones.a.bounds,current.obstacle.stones.b.bounds,current.obstacle.deadwood.bounds]
      .some(b=>b.x-(px+12)>=-1 && b.x-(px+12)<16 && player.position.y+14>b.y);
    if((stuck>=3 || obstacleAhead && player.grounded) && jumpTicks===0) jumpTicks=24;
    session.advanceTicks(3,{moveX:axis,jump:jumpTicks>12});
    if(jumpTicks>0) jumpTicks--;
  }
  expect(session.snapshot().runtime.spatial.player.position.x,JSON.stringify({player:session.snapshot().runtime.spatial.player,bodies:session.toSave().runtime.obstacle.creek?.bodies})).toBeGreaterThanOrEqual(x);
}

describe('F3–F5 integrated physics (chipped v0.3, not legacy instant routes)',()=>{
  it('culls only unowned overlay chunks, including conservative moving-body edge pixels',()=>{
    const world=creek();
    for(let tick=1;tick<=30;tick++) {
      if(tick===1) world.push('stream.stone.a',1);
      world.advance(tick);
      for(let y=620;y<800;y+=16) for(let x=1712;x<2128;x+=16) {
        const bounds={x,y,width:16,height:16};
        if(world.affectsChunk(bounds)) continue;
        for(let py=y;py<y+16;py++) for(let px=x;px<x+16;px++) {
          if(world.materialAt(px,py)!==null) throw new Error(`culled an owned material pixel at ${px},${py}`);
        }
      }
    }
    expect(world.affectsChunk({x:1712,y:620,width:16,height:16})).toBe(false);
    expect(world.affectsChunk(pocket)).toBe(true);
  },15000);
  it('applies a bounded impulse without teleporting, then falls and rests on real ground',()=>{
    const original=initialForestBodies()[0]!;
    const pushed=pushForestBody(original,1);
    expect(pushed.x).toBe(original.x); expect(pushed.vx).toBeGreaterThan(0);
    let body={...pushed,y:670};
    const world={solid:(b:{y:number;height:number})=>b.y+b.height>713,wet:()=>0,admit:()=>true};
    for(let i=0;i<180;i++) body=stepForestBody(body,world);
    expect(body.y+body.height).toBeCloseTo(713,3);
    expect(body.x).toBeGreaterThan(original.x+10);
    expect(body.vy).toBe(0);
  });
  it('buoyant wood rises in water while stone sinks, and an actor blocks a newly overlapping body',()=>{
    const wood=initialForestBodies()[2]!,stone=initialForestBodies()[0]!;
    const wet={solid:()=>false,wet:()=>1,admit:()=>true};
    expect(stepForestBody(wood,wet).vy).toBeLessThan(0);
    expect(stepForestBody(stone,wet).vy).toBeGreaterThan(0);
    const pushed=pushForestBody(stone,1);
    const actor={x:1800,y:701,width:12,height:14};
    const stopped=stepForestBody(pushed,{...wet,wet:()=>0},actor);
    expect(stopped.x+stopped.width).toBeLessThanOrEqual(actor.x);
  });
  it('gives dragged wood a continuous low-lip impulse but cannot climb a tall wall',()=>{
    const wood=pushForestBody(initialForestBodies()[2]!,1);
    const edge=wood.x+wood.width;
    const world={solid:(b:{x:number;y:number;width:number;height:number})=>b.x+b.width>edge && b.y+b.height>wood.y+2,
      wet:()=>0,admit:()=>true};
    const lifted=stepForestBody(wood,world);
    expect(lifted.vy).toBeLessThan(0);
    expect(wood.y-lifted.y).toBeGreaterThan(0);
    expect(wood.y-lifted.y).toBeLessThan(2);
    const walled=stepForestBody(wood,{...world,solid:b=>b.x+b.width>edge});
    expect(walled.x).toBe(wood.x);expect(walled.vx).toBe(0);expect(walled.vy).toBeGreaterThan(0);
  });
  it('keeps resting contact stable but wakes when support vanishes, water rises or a push arrives',()=>{
    const wood={...initialForestBodies()[2]!,y:707,restTicks:120};
    const world={solid:(b:{y:number;height:number})=>b.y+b.height>713,wet:()=>0,admit:()=>true};
    expect(stepForestBody(wood,world)).toEqual(wood);
    expect(stepForestBody(wood,{...world,solid:()=>false}).y).toBeGreaterThan(wood.y);
    expect(stepForestBody(wood,{...world,wet:()=>1}).y).toBeLessThan(wood.y);
    expect(stepForestBody(pushForestBody(wood,1),world).x).toBeGreaterThan(wood.x);
  });
  it('retains water and excavated grains while bodies displace rather than delete liquid',()=>{
    const world=creek();
    world.push('stream.stone.a',1); world.push('stream.stone.b',1);
    advance(world,1,180);
    expect(count(world,Material.Water)).toBe(400);
    expect(world.dig()).toBe(true); expect(world.dig()).toBe(false);
    advance(world,181,420);
    expect(count(world,Material.Water)).toBe(400);
    expect(count(world,Material.Sand)).toBe(96); expect(count(world,Material.Soil)).toBe(0);
    expect(world.bodyStates.some(b=>b.x>1826 && b.y>701)).toBe(true);
    for(const body of world.bodyStates) expect(world.bodySolid(body,body.id),JSON.stringify(body)).toBe(false);
    const loaded=new ForestOpeningCreek(pocket,world.save());
    loaded.bindTerrain((_x,y)=>y>=713?FOREST_MATERIAL.stone:FOREST_MATERIAL.air);
    advance(world,421,460); advance(loaded,421,460);
    expect(loaded.save()).toEqual(world.save());
  });
  it('keeps dry movement byte-identical and gives only immersed actors water drag',()=>{
    const options={state:{x:0,y:0,velocityX:50,velocityY:70,grounded:false},body:{width:12,height:14},
      input:{moveX:1,jump:false},previousJump:false,fixedSeconds:1/60,collides:()=>false};
    const dry=stepPlayerMotion(options);
    expect(stepPlayerMotion({...options,immersion:0})).toEqual(dry);
    const wet=stepPlayerMotion({...options,immersion:1});
    expect(wet.state.velocityX).toBeLessThan(dry.state.velocityX);
    expect(wet.state.velocityY).toBeLessThan(dry.state.velocityY);
  });
  it('accepts every moving soil-route save instead of rejecting a transient player contact',()=>{
    const session=PrologueForestOpeningSession.fresh({sessionId:'integrated.soil-save',seed:'integrated.routes'});
    walkTo(session,1860);
    expect(session.interact('dig',{kind:'enter_shallow_detour'},session.snapshot().runtime.obstacle.revision).accepted).toBe(true);
    for(let tick=0;tick<160;tick++) {
      session.advanceTicks(1);
      if(tick%8===0) {
        const saved=session.toSave();
        const loaded=PrologueForestOpeningSession.fromSave(saved);
        expect(loaded.toSave()).toEqual(saved);
      }
    }
  },60000);
  it('consumes finite local ember fuel with an explicit exhaust ledger and exact restoration',()=>{
    const embers=new ForestOpeningEmbers();
    embers.advance(); expect(embers.save().grid.tick).toBe(0);
    embers.advance({x:2000,y:690,width:12,height:14});
    expect(embers.save().grid.burning.some(value=>value>0)).toBe(true);
    const loaded=new ForestOpeningEmbers(embers.save());
    for(let i=0;i<140;i++) {embers.advance();loaded.advance();}
    expect(loaded.save()).toEqual(embers.save());
    const saved=embers.save();
    expect(saved.grid.material.filter(m=>m===Material.Wood)).toHaveLength(0);
    expect(saved.grid.material.filter(m=>m===Material.Ash).length+saved.releasedFuel).toBe(8);
    expect(()=>new ForestOpeningEmbers({...saved,releasedFuel:saved.releasedFuel+1})).toThrow(/ledger|invalid/);
  });
  for(const route of ['stone_steps','deadwood_bridge'] as const) it(`commits ${route} only after continuous motion and actual passage`,()=>{
    let session=PrologueForestOpeningSession.fresh({sessionId:'integrated.'+route,seed:'integrated.routes'});
    walkTo(session,route==='stone_steps'?1770:1885);
    if(route==='deadwood_bridge') session.advanceTicks(60); // Land and release the previous jump before pulling.
    const interact=(id:'stream.stone.a'|'stream.stone.b'|'stream.deadwood',direction:-1|1)=>{
      const revision=session.snapshot().runtime.obstacle.revision;
      const before=session.toSave();
      const result=session.interact('physics.'+id,id==='stream.deadwood'?{kind:'drag_deadwood',objectId:id,direction}:
        {kind:'push_stone',objectId:id,direction},revision);
      expect(result).toMatchObject({accepted:true,reason:'partial'});
      expect(session.toSave().runtime.obstacle.creek?.bodies?.map(b=>[b.x,b.y])).toEqual(before.runtime.obstacle.creek?.bodies?.map(b=>[b.x,b.y]));
      expect(session.snapshot().storyRouteReady).toBe(false);
    };
    if(route==='stone_steps') {
      interact('stream.stone.a',1);session.advanceTicks(90);
      interact('stream.stone.b',1);session.advanceTicks(300);
      const revision=session.snapshot().runtime.obstacle.revision;
      expect(session.interact('physics.stone.a.again',{kind:'push_stone',objectId:'stream.stone.a',direction:1},revision).accepted).toBe(true);
    }
    else {interact('stream.deadwood',-1);}
    session.advanceTicks(20,{moveX:route==='deadwood_bridge'?-1:0,jump:route==='deadwood_bridge'});
    const saved=session.toSave();
    const restored=PrologueForestOpeningSession.fromSave(saved);
    session.advanceTicks(90,{moveX:route==='deadwood_bridge'?-1:0});
    restored.advanceTicks(90,{moveX:route==='deadwood_bridge'?-1:0});
    expect(restored.toSave()).toEqual(session.toSave()); session=restored;
    session.advanceTicks(360);
    const beforePassage=session.snapshot();
    expect(beforePassage.storyRouteReady).toBe(false);
    if(route==='stone_steps') expect(beforePassage.runtime.obstacle.stones).toMatchObject({a:{seated:true},b:{seated:true}});
    else expect(beforePassage.runtime.obstacle.deadwood.bridged,JSON.stringify(session.toSave().runtime.obstacle.creek?.bodies)).toBe(true);
    if(route==='deadwood_bridge') {
      walkTo(session,1866,0.25); session.advanceTicks(60);
      session.advanceTicks(36,{moveX:1,jump:true});session.advanceTicks(1,{jump:false});
    }
    walkTo(session,1980);session.advanceTicks(60);
    expect(session.snapshot().runtime.obstacle.committedSolutionId).toBe(route);
    expect(session.snapshot().session.learning.words).toEqual({});
  },60000);
  it('crosses the actual terrain without a solution gate or tool, commits once, and restores exactly',()=>{
    const session=PrologueForestOpeningSession.fresh({sessionId:'integrated.route',seed:'integrated.route',currentMp:13,maxMp:24});
    const originalStory=session.toSave().session;
    const failure=vi.spyOn(PrologueFlowSession.prototype,'digSoftSoil').mockImplementationOnce(()=>{throw new Error('test story transaction failed');});
    try {expect(()=>walkTo(session,1980)).toThrow('test story transaction failed');}
    finally {failure.mockRestore();}
    expect(session.toSave().session).toEqual(originalStory);
    expect(session.toSave().runtime.obstacle.routeProof).toBeNull();
    expect(session.snapshot().storyRouteReady).toBe(false);
    expect(PrologueForestOpeningSession.fromSave(session.toSave()).toSave()).toEqual(session.toSave());
    walkTo(session,1980); session.advanceTicks(90);
    const result=session.snapshot();
    expect(result.storyRouteReady).toBe(true);
    expect(result.runtime.obstacle.committedSolutionId).toBe('shallow_detour');
    expect(session.toSave().runtime.obstacle.creek?.excavatedSoil).toBe(0);
    expect(result.session.mp.currentMp).toBe(13);
    expect(result.session.learning.words).toEqual({});
    const saved=session.toSave();
    const loaded=PrologueForestOpeningSession.fromSave(saved);
    expect(loaded.toSave()).toEqual(saved);
    loaded.advanceTicks(120);
    expect(loaded.toSave().session.eventLedger).toEqual(saved.session.eventLedger);
  },60000);
});
