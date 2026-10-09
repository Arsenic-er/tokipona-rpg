import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {siteLeadReadyFixture} from './forest-site-lead-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
import {actEpisode as act} from './forest-cistern-fixture';
it('exports an earned allocation at the archive with the site lead still untouched',()=>{
 const g=siteLeadReadyFixture(),save=g.toSave();
 expect(g.leadStage).toBe('unvisited');expect(g.allocationMode).toBe('wetland_priority');
 expect(ForestEpisode.restore(save).toSave()).toEqual(save);
 const dir='.codex-tmp/site-lead';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/ready.json',JSON.stringify(save));
 g.interact('node-archive','lead:inspect');writeFileSync(dir+'/inspected.json',JSON.stringify(g.toSave()));
 g.interact('node-archive','lead:record');writeFileSync(dir+'/recorded.json',JSON.stringify(g.toSave()));
 act(g,'return');act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');act(g,'worker');
 writeFileSync(dir+'/worker-ready.json',JSON.stringify(g.toSave()));
 act(g,'hermit-road');act(g,'hermit');writeFileSync(dir+'/hermit-ready.json',JSON.stringify(g.toSave()));
},90000);
