import {siteLeadReadyFixture} from './forest-site-lead-fixture';
import {actEpisode} from './forest-cistern-fixture';
import type {AllocationMode} from '../../src/world/forest-water-allocation';
export function epilogueReadyFixture(mode:AllocationMode='wetland_priority'){
 const g=siteLeadReadyFixture(mode);g.interact('node-archive','lead:inspect');g.interact('node-archive','lead:record');
 actEpisode(g,'node-exit');
 if(g.epilogueStage!=='unvisited'||g.leadStage!=='recorded')throw Error('Epilogue fixture must earn the lead without sealing it');
 return g;
}
