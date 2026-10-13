import {ARCHIVE_RIG,archiveRigFrame,type ArchiveRigState} from '../world/forest-archive-rig';
export function drawArchiveRig(ctx:CanvasRenderingContext2D,state?:ArchiveRigState,taken=false):void{
 const {x,y,width,height}=ARCHIVE_RIG,f=archiveRigFrame(state);
 // Pipe is a level interlock, not an infinite water-powered motor.
 ctx.fillStyle='#666b56';ctx.fillRect(232,180,x-232,2);ctx.fillRect(x,y,width,height);
 ctx.fillStyle='#172621';ctx.fillRect(x+2,y+2,width-4,height-4);
 ctx.fillStyle='#738170';ctx.fillRect(x+14,y+46,72,2);ctx.fillRect(x+14,y+53,72,1);
 ctx.fillStyle='#a39570';ctx.fillRect(x+29,y+38,1,19);ctx.fillRect(x+81,y+38,2,19);
 const cx=x+16+Math.round(f.position);
 ctx.fillStyle='#617e70';ctx.fillRect(cx-5,y+38,10,8);
 if(!taken){ctx.fillStyle='#c0b18a';ctx.fillRect(cx-2,y+37,4,5);}
 ctx.fillStyle='#999774';ctx.fillRect(x+15,y+64,18,2);
 const angle=f.cam*Math.PI/24,ax=x+24,ay=y+65;
 for(let i=0;i<8;i++)ctx.fillRect(ax+Math.round(Math.cos(angle)*i),ay+Math.round(Math.sin(angle)*i),1,1);
 // Single/double notches identify direction and the retained charge without colour alone.
 ctx.fillRect(x+(f.gear===-1?14:32),y+74,3,2);
 ctx.fillStyle='#33453b';ctx.fillRect(x+92,y+20,5,52);
 ctx.fillStyle='#96ad8c';const charge=Math.floor(f.remaining/32);ctx.fillRect(x+93,y+70-charge,3,charge);
 ctx.fillStyle='#a49472';ctx.fillRect(x+3,y+52,state?6:2,2);
 if(f.delivered){ctx.fillRect(x+25,y+54,14,2);if(taken)ctx.fillRect(x+27,y+33,2,3);}
}
