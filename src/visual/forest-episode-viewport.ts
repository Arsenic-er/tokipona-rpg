import type {ForestCameraState} from '../runtime/forest-camera';
/** Preserve aspect ratio without cropping the traveler when a room is narrower than the requested view. */
export function episodeViewport(composed:ForestCameraState,player:{x:number;y:number},bounds:{width:number;height:number},aspect:number):ForestCameraState{
  const width=Math.min(bounds.width,Math.round(composed.height*aspect)),height=Math.round(width/aspect);
  const anchor=Math.max(.2,Math.min(.8,(player.x+6-composed.x)/composed.width));
  const centeredY=composed.y+(composed.height-height)/2;
  // Retain normal follow lag until it would hide the 19px sprite; then keep a small visible margin.
  const visibleY=Math.max(player.y+14+16-height,Math.min(player.y-5-16,centeredY));
  return {...composed,width,height,
    x:Math.round(Math.max(0,Math.min(bounds.width-width,player.x+6-anchor*width))),
    y:Math.round(Math.max(0,Math.min(bounds.height-height,visibleY)))};
}
