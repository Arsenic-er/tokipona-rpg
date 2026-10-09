import {allocationReadyFixture} from './forest-allocation-fixture';
import {actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
import type {AllocationMode} from '../../src/world/forest-water-allocation';
export function siteLeadReadyFixture(mode:AllocationMode='wetland_priority'){
 const g=allocationReadyFixture();g.interact('node-allocation','allocation:preview:'+mode);g.interact('node-allocation','allocation:confirm:'+mode);tick(g,900);
 act(g,'node-archive');
 if(g.allocationMode!==mode||g.leadStage!=='unvisited')throw Error('Site lead fixture must earn allocation without revealing a lead');
 return g;
}
