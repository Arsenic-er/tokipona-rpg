import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ForestEpisode,episodeCollides,type ForestEpisodeSave} from './forest-episode';
import {wetlandReadyFixture} from '../../scripts/testing/forest-wetland-fixture';
import {actEpisode as act,approachEpisode as approach,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {migrationBodies} from '../world/forest-wetland-migration';
import {intersects} from '../runtime/geometry';
import {GameSession} from '../session/game-session';
import {commitSessionProposal,proposeWildlifeLifeRegistration,proposeWildlifeDamage} from '../session/adapters';
import {createWildlifeLifeRecord} from './life-corpse-ledger';
import {createStableWildlifeLifeId} from './wildlife-state-machine';
let ready:ForestEpisodeSave,beforeEntry:ForestEpisodeSave;
const dir=resolve('.codex-tmp/wetland-migration');
beforeAll(()=>{
  const g=wetlandReadyFixture(false);beforeEntry=g.toSave();
  act(g,'flow-depth');ready=g.toSave();
  expect(ForestEpisode.restore(ready).toSave()).toEqual(ready);
  mkdirSync(dir,{recursive:true});
},60000);
const prepare=(g:ForestEpisode)=>{act(g,'wetland-lookout');act(g,'wetland-nest');act(g,'wetland-young');act(g,'wetland-clear');};
const resources=(g:ForestEpisode)=>({mp:g.sessionState.mp,learning:g.sessionState.learning,economy:g.sessionState.economy,capabilities:g.sessionState.capabilities});
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
describe('earned wetland and archive continuation',()=>{
  it('keeps persistent life identities and ignores remote or out-of-order actions',()=>{
    const g=ForestEpisode.restore(ready),lives=g.sessionState.lifeCorpseLedger.lives;
    expect(g.state.migration?.mode).toBe('searching_for_young');
    expect(Object.values(lives).filter(l=>l.species==='large_semiaquatic_nester')).toHaveLength(2);
    expect(g.interact('node-road').accepted).toBe(false);
    act(g,'wetland-clear');expect(g.hasMigration('cleared')).toBe(false);
    act(g,'wetland-young');expect(g.hasMigration('young')).toBe(false);
    act(g,'return');const pose=structuredClone(g.state.migration);tick(g,800);
    expect(g.state.migration).toEqual(pose);act(g,'flow-depth');
    expect(g.sessionState.lifeCorpseLedger.lives).toEqual(lives);expect(g.state.migration).toEqual(pose);
  });
  it('waits for actual retreat/movement, preserves mid-route saves and commits the canonical outcome once',()=>{
    let g=ForestEpisode.restore(ready);const before=resources(g);prepare(g);tick(g,900);
    expect(g.hasMigration('resolved')).toBe(false);expect(g.state.migration?.adultX).toBe(330);
    expect(g.state.migration?.mode).toBe('warning');
    approach(g,'wetland-lookout');tick(g,120);expect(g.state.migration!.adultX).toBeGreaterThan(330);
    expect(g.hasMigration('resolved')).toBe(false);
    const partial=g.toSave();writeFileSync(resolve(dir,'partial.json'),JSON.stringify(partial));
    g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
    tick(g,800);expect(g.hasMigration('resolved')).toBe(true);
    expect(g.sessionState.quests.ch01_large_creature_crisis.stageId).toBe('completed');
    expect(g.sessionState.world.flags['region:valley_prologue:forest_large_creature_resolution']?.value).toBe('migration_restored');
    expect(g.sessionState.world.flags['region:valley_prologue:forest_large_creature_resolution_committed']?.value).toBe(true);
    const revision=g.sessionState.revision;tick(g,1000);expect(g.sessionState.revision).toBe(revision);
    expect(resources(g)).toEqual(before);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    writeFileSync(resolve(dir,'resolved.json'),JSON.stringify(g.toSave()));
  });
  it('prevents walking through living animals before the migration',()=>{
    const g=ForestEpisode.restore(ready);
    for(let i=0;i<900;i++){
      g.advance({moveX:1,jump:false});
      for(const b of migrationBodies(g.state.migration!,g.migrationControls))
        expect(intersects({...g.state.player,width:12,height:14},b)).toBe(false);
    }
    expect(g.state.player.x).toBeLessThan(282);expect(g.hasMigration('resolved')).toBe(false);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  });
  it('opens only the archive foyer, retains the shard, and supports a full backtrack/revisit with no new rewards',()=>{
    const g=ForestEpisode.restore(ready),before=resources(g);prepare(g);approach(g,'wetland-lookout');tick(g,900);
    act(g,'node-road');expect(g.state.place).toBe('order-node');act(g,'node-survey');
    act(g,'node-archive');expect(g.hasMigration('archive')).toBe(true);
    act(g,'node-cradle');act(g,'node-allocation');act(g,'node-exit');expect(g.state.place).toBe('order-node');
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    writeFileSync(resolve(dir,'archive.json'),JSON.stringify(g.toSave()));
    for(const f of ['forest_site_synchronized','forest_water_allocation_committed','forest_site_lead_revealed','forest_chapter_epilogue_committed','prologue_return_observed','first_attack_signature_available'])
      for(const scope of ['global:', 'region:valley_prologue:'])expect(g.sessionState.world.flags[scope+f]?.value).not.toBe(true);
    expect(g.sessionState.world.flags['global:owns.artifact.fragment.forest_site']?.value).toBe(true);
    const lives=structuredClone(g.sessionState.lifeCorpseLedger);
    act(g,'return');act(g,'return');const pose=structuredClone(g.state.migration);
    act(g,'return');const water=structuredClone(g.state.returnFlow);
    act(g,'top-exit');act(g,'return');act(g,'worker');
    expect(g.state.place).toBe('settlement');expect(g.state.migration).toEqual(pose);expect(g.state.returnFlow).toEqual(water);
    act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');act(g,'flow-depth');
    expect(g.sessionState.lifeCorpseLedger).toEqual(lives);expect(g.state.migration).toEqual(pose);
    act(g,'node-road');expect(g.hasMigration('archive')).toBe(true);expect(resources(g)).toEqual(before);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },30000);
  it.each([25,100])('preserves pre-existing injury or death from the shared ledger (damage %i)',damage=>{
    // A legitimate external domain transaction, not fabricated state flags or a new gameplay attack.
    const save=structuredClone(beforeEntry),entityId='wildlife.valley.large_semiaquatic_nester';
    let session=GameSession.fromSave(save.session);
    const lifeId=createStableWildlifeLifeId({regionSaveId:session.sessionId,entityId,spawnGeneration:0,spawnSequence:0});
    const life=createWildlifeLifeRecord({lifeInstanceId:lifeId,regionSaveId:session.sessionId,regionId:'valley_prologue',
      entityId,species:'large_semiaquatic_nester',ageClass:'adult',spawnGeneration:0,spawnSequence:0,
      harvestProfileId:'forest.large_semiaquatic_nester.no_harvest',maxHp:100,registeredAtWorldTick:session.snapshot().survival.worldTicks});
    const registration=commitSessionProposal(session,proposeWildlifeLifeRegistration('test.wetland.register',life));
    expect(registration.committed).toBe(true);session=registration.session;
    const hit=commitSessionProposal(session,proposeWildlifeDamage(session,{
      transactionId:'test.wetland.damage',lifeInstanceId:lifeId,expectedLifeRevision:0,damage,causeClass:'other_physical',
      worldTick:session.snapshot().survival.worldTicks,position:{sceneId:'scene.valley.return_channel',x:330,y:350}}));
    expect(hit.committed).toBe(true);session=hit.session;save.session=session.toSave();
    const prior=session.snapshot().lifeCorpseLedger.lives[lifeId];
    const g=ForestEpisode.restore(rehash(save));act(g,'flow-depth');
    expect(g.sessionState.lifeCorpseLedger.lives[lifeId]).toEqual(prior);
    expect(Object.values(g.sessionState.lifeCorpseLedger.lives).filter(l=>l.entityId===entityId)).toHaveLength(1);
    prepare(g);approach(g,'wetland-lookout');tick(g,900);
    expect(g.hasMigration('resolved')).toBe(damage<100);
    expect(g.sessionState.lifeCorpseLedger.lives[lifeId]).toEqual(prior);
    if(damage<100)expect(g.sessionState.world.flags['region:valley_prologue:forest_large_creature_life_state']?.value).toBe('injured');
    else expect(g.state.migration?.mode).toBe('dead');
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    act(g,'return');act(g,'flow-depth');expect(g.sessionState.lifeCorpseLedger.lives[lifeId]).toEqual(prior);
  });
  it('rejects missing ecology, forged arrival and scene entry without resolution',()=>{
    expect(episodeCollides('order-node',{x:430,y:322,width:12,height:14})).toBe(false);
    expect(episodeCollides('order-node',{x:430.01,y:322,width:12,height:14})).toBe(true);
    expect(episodeCollides('order-node',{x:28,y:322.01,width:12,height:14})).toBe(true);
    expect(episodeCollides('order-node',{x:28,y:63.99,width:12,height:14})).toBe(true);
    const g=ForestEpisode.restore(ready);
    const missing=g.toSave();delete missing.physical.migration;
    expect(()=>ForestEpisode.restore(rehash(missing))).toThrow();
    const arrival=g.toSave();Object.assign(arrival.physical.migration!,{adultX:688,youngX:640,mode:'resettling',calm:60,age:900});
    expect(()=>ForestEpisode.restore(rehash(arrival))).toThrow();
    const scene=g.toSave();scene.physical.place='order-node';scene.physical.player={x:28,y:322,velocityX:0,velocityY:0,grounded:true};
    expect(()=>ForestEpisode.restore(rehash(scene))).toThrow();
  });
});
