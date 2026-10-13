import {NODE_WATER} from '../world/forest-node-water';
import {Material} from '../sim/materials';
/** Pixel material cells are the simulation itself, not a success animation. */
export function drawNodeWater(ctx:CanvasRenderingContext2D,cells:readonly number[],braced=false,completed=false):void{
 const {x,y,columns,rows,cell}=NODE_WATER;
 ctx.fillStyle='#756e57';ctx.fillRect(x-2,y-2,columns*cell+4,rows*cell+4);
 ctx.fillStyle='#14221f';ctx.fillRect(x,y,columns*cell,rows*cell);
 for(let i=0;i<cells.length;i++){
  const c=cells[i];if(c===Material.Air)continue;const cx=i%columns,cy=Math.floor(i/columns);
  ctx.fillStyle=c===Material.Water?'#72a8ad':(cx+cy)%7===0?'#535e4c':'#39483f';ctx.fillRect(x+cx*cell,y+cy*cell,cell,cell);
 }
 for(const [cx,width,n] of [[1,14,1],[41,20,2],[62,19,3]] as const){
  ctx.fillStyle='#b4a279';ctx.fillRect(x+cx*cell,y+37*cell,width*cell,1);
  for(let i=0;i<n;i++)ctx.fillRect(x+cx*cell+2+i*3,y+rows*cell-4,1,2);
 }
 // Mechanical linkage and the latched inspection indicator sit in the dry partition.
 ctx.fillStyle='#807961';ctx.fillRect(x+36,y+53,38,1);ctx.fillRect(x+36,y+20,1,34);
 ctx.fillStyle='#b4a279';ctx.fillRect(x+48,y+46,completed?16:5,completed?5:16);
 // A visible brace distinguishes supported long casts from greater attack power.
 if(braced){ctx.fillStyle='#b4a279';ctx.fillRect(x+78,y+26,3,14);}
}
