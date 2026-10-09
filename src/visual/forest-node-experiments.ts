import {NODE_EXPERIMENTS,nodeExperimentView,type NodeExperiment,type NodeExperimentState} from '../world/forest-node-experiments';
/** Recessed wall instruments, not platforms. Keep the maintenance walkway and actor collision unchanged. */
export function drawNodeExperiments(ctx:CanvasRenderingContext2D,state?:NodeExperimentState):void {
  for(const kind of Object.keys(NODE_EXPERIMENTS) as NodeExperiment[]){
    const {x,ticks}=NODE_EXPERIMENTS[kind],run=state?.[kind],view=nodeExperimentView(kind,run);
    ctx.fillStyle='#55594c';ctx.fillRect(x-22,265,44,63);
    ctx.fillStyle='#a0926a';ctx.fillRect(x-21,264,42,2);
    ctx.fillStyle='#111d1c';ctx.fillRect(x-20,268,40,56);
    for(const [side,body] of [[-1,view.left],[1,view.right]] as const){
      const cx=x+side*10;
      ctx.fillStyle='#4a5146';ctx.fillRect(cx-9,274,18,42);
      ctx.fillStyle='#182623';ctx.fillRect(cx-8,275,16,40);
      // One notch identifies the reference, two the right test chamber (not colour alone).
      ctx.fillStyle='#b9aa80';ctx.fillRect(cx-3,270,2,2);if(side===1)ctx.fillRect(cx+2,270,2,2);
      const bx=kind==='time'?Math.round(cx+Math.sin(body.offset)*14):cx;
      const by=kind==='time'?Math.round(279+Math.cos(body.offset)*14):Math.round(295+body.offset);
      if(kind==='time'){
        ctx.strokeStyle='#777865';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+.5,278.5);ctx.lineTo(bx+.5,by+.5);ctx.stroke();
        ctx.fillStyle='#686d57';ctx.fillRect(cx,296,1,3);
        for(let n=0;n<body.crossings;n++){ctx.fillStyle='#9f9472';ctx.fillRect(cx-7+n*2,310,1,3);}
      }else{
        ctx.fillStyle='#6e7462';ctx.fillRect(cx,276,1,by-276);
        for(const y of [280,295,310]){ctx.fillStyle='#a79b76';ctx.fillRect(cx-8,y,3,1);}
      }
      ctx.fillStyle='#303934';ctx.fillRect(bx-2,by-2,5,5);
      ctx.fillStyle=side===1?'#86a8a1':'#c0aa77';ctx.fillRect(bx-1,by-1,3,3);
    }
    ctx.fillStyle='#555b4a';ctx.fillRect(x-18,320,36,2);
    if(run){ctx.fillStyle='#b0a278';ctx.fillRect(x-18,320,Math.floor(36*run.age/ticks),2);}
    ctx.fillStyle=run?.mode==='anomaly'?'#87a19a':'#85785b';ctx.fillRect(x+16,325,3,4);
    ctx.fillStyle='#77725a';ctx.fillRect(x-18,329,4,7);ctx.fillRect(x+14,329,4,7);
  }
}
