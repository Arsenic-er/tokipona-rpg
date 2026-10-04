import {it,expect} from 'vitest';
import {episodeViewport} from './forest-episode-viewport';
import {initializeForestCamera} from '../runtime/forest-camera';
const contract={fixedZoom:true,pixelSnap:true,movementLookAheadRatio:.18,downwardBiasRatio:.14,upwardLagRatio:.08,deadZoneNormalized:{left:.38,right:.62,top:.35,bottom:.67}} as const;
it.each([1280/720,844/390,390/844,2560/1080])('keeps a whole traveler in a narrow tall room at aspect %s',aspect=>{
  const bounds={x:0,y:0,width:480,height:768};
  for(const position of [{x:52,y:722},{x:410,y:620},{x:366,y:530},{x:50,y:430},{x:108,y:338}]){
    const p={position,velocity:{x:0,y:0},grounded:true,body:{width:12,height:14}};
    const c=initializeForestCamera(contract,p,bounds),v=episodeViewport(c,position,bounds,aspect);
    expect(position.x+6).toBeGreaterThanOrEqual(v.x);expect(position.x+6).toBeLessThan(v.x+v.width);
    expect(position.y-5).toBeGreaterThanOrEqual(v.y);expect(position.y+14).toBeLessThanOrEqual(v.y+v.height);
    expect(v.x).toBeGreaterThanOrEqual(0);expect(v.y).toBeGreaterThanOrEqual(0);
    expect(v.x+v.width).toBeLessThanOrEqual(bounds.width);expect(v.y+v.height).toBeLessThanOrEqual(bounds.height);
    expect(Math.abs(v.width/v.height-aspect)).toBeLessThan(.02);
  }
});
