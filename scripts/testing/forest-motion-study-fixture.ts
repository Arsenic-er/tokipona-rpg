import {waterStudyReadyFixture} from './forest-water-study-fixture';
import {actEpisode as act} from './forest-cistern-fixture';
export function motionStudyReadyFixture(debrief=true){
 const g=waterStudyReadyFixture(12,debrief);
 act(g,'return');act(g,'mill-road');act(g,'brace');return g;
}
