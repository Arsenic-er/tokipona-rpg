import { ForestEpisode } from '../game/forest-episode';
import { migrationBody, wetlandGround, orderNodeSolid } from '../world/forest-wetland-migration';
import { RETURN_CHANNEL_PORTS, returnChannelControls, returnChannelRates } from '../world/forest-return-channel';
import type { ForestCameraState } from '../runtime/forest-camera';
import type { ForestOpeningPublicView } from './forest-opening-view';
import { forestMaterialColor } from './forest-material-texture';
import { FOREST_MATERIAL as M } from '../world/forest-chunk-stream';
import { episodeWaterSolid } from '../world/forest-episode-water';
import { drawForestOpeningLocalTraveler, type LocalTravelerAtlas } from './browser-local-traveler-atlas';
import { drawForestOpeningCandidateTraveler } from './forest-opening-candidate-traveler';
import { drawLocalForestBackdrop } from './browser-local-forest-backdrop';
import { drawForestOpeningBackdrop } from './forest-opening-backdrop';
import { drawForestBuilding, type ForestBuildingKind } from './forest-architecture';
import { forestEarthProfile, forestBuriedColor } from './forest-earth-profile';
import { drawForestNpc } from './forest-npc';
import { drawForestEdgeDressing, MEADOW_TREE_ROOTS } from './forest-edge-dressing';
import { hasMillValley, MILL_TREE_ROOTS } from '../world/forest-mill-terrain';
import { HERMIT_TREE_ROOTS, hermitClearingPad } from '../world/forest-hermit-terrain';
import { MILL_TAILRACE, millDrainInterior, millDrainLining } from '../world/forest-mill-tailrace';
import { cisternEntryCeiling, cisternEntryFloor, cisternEntrySolid, CISTERN_ENTRY_GATE } from '../world/forest-cistern-entry';
import { CISTERN_WINDOW } from '../world/forest-cistern-window';
import { Material } from '../sim/materials';
import type { TeloCastPlan } from '../spells/cast-plan';
import { CISTERN_PLATFORMS, cisternRoomSolid } from '../world/forest-cistern-room';
import { CISTERN_CALIBRATION } from '../world/forest-cistern-calibration';
import { CISTERN_SIPHON } from '../world/forest-cistern-siphon';

type Backdrop = CanvasImageSource & { naturalWidth: number; naturalHeight: number };
/** Native-pixel architecture/material drawing; private raster assets remain on the existing local-only path. */
export class ForestEpisodeRenderer {
  private terrain = new Map<string, HTMLCanvasElement>();
  private wood = new Map<string, HTMLCanvasElement>();
  constructor(private readonly atlas: LocalTravelerAtlas | null, private readonly backdrop: Backdrop | null) {}
  draw(ctx: CanvasRenderingContext2D, game: ForestEpisode, camera: ForestCameraState, view: ForestOpeningPublicView, windowPlan: TeloCastPlan | null = null): void {
    const p = game.state;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1c2a29'; ctx.fillRect(0, 0, camera.width, camera.height);
    if (p.place !== 'cistern-entry'&&p.place!=='cistern'&&p.place!=='order-node') {
      if (this.backdrop) drawLocalForestBackdrop(ctx, camera, this.backdrop);
      else drawForestOpeningBackdrop(ctx, camera, 360);
      ctx.fillStyle = 'rgba(19,32,30,.24)'; ctx.fillRect(0, 0, camera.width, camera.height);
    } else { ctx.fillStyle = '#182220'; ctx.fillRect(0, 0, camera.width, camera.height); }
    if (p.place === 'settlement') drawForestEdgeDressing(ctx, camera, MEADOW_TREE_ROOTS, x => game.groundAt(x));
    if (p.place === 'mill' && hasMillValley(game.terrainProfile)) drawForestEdgeDressing(ctx, camera, MILL_TREE_ROOTS, x => game.groundAt(x));
    if (p.place === 'hermit' && game.terrainProfile === 'forest-clearing-v1') drawForestEdgeDressing(ctx, camera, HERMIT_TREE_ROOTS, x => game.groundAt(x));
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    if (p.place === 'settlement') {
      this.house(ctx, 235, 336, 135, 70, 'store'); this.house(ctx, 600, 336, 164, 92, 'inn');
      this.fence(ctx, 385, 170, x => game.groundAt(x));
      const spoutY=game.groundAt(532);
      this.rock(ctx,521,spoutY-12,27,12);
      ctx.fillStyle='#132520';ctx.fillRect(525,spoutY-10,19,6);
      ctx.fillStyle='#8b886a';ctx.fillRect(528,spoutY-21,5,12);ctx.fillRect(531,spoutY-21,8,3);
      if(game.hasFlow('restored')){ctx.fillStyle='#75a2a3';ctx.fillRect(536,spoutY-18,1,11);
        ctx.fillStyle='#426d73';ctx.fillRect(526,spoutY-7,17,3);}
      drawForestNpc(ctx, 'worker', 350, game.groundAt(350), p.tick);
      this.lantern(ctx, 390, game.groundAt(390) - 17, p.tick); this.lantern(ctx, 780, game.groundAt(780) - 17, p.tick);
    } else if (p.place === 'mill') {
      this.house(ctx, 745, 336, 214, 108, 'mill');
      this.timber(ctx, 255, 331, 38, 5); this.timber(ctx, 260, 326, 33, 5); this.timber(ctx, 258, 321, 36, 5);
      this.timber(ctx, 670, 266, 7, game.groundAt(670) - 267); this.timber(ctx, 672, 264, 56, 7);
      if (game.has('brace')) {
        ctx.save();
        if (hasMillValley(game.terrainProfile)) {
          const footY = game.groundAt(708) - 1, dx = 675 - 708, dy = footY - 266;
          ctx.translate(708, footY); ctx.rotate(Math.atan2(dx, dy));
          const height = Math.round(Math.hypot(dx, dy)); this.timber(ctx, 0, -height, 6, height);
        } else { ctx.translate(683, 333); ctx.rotate(-0.35); this.timber(ctx, 0, -64, 6, 64); }
        ctx.restore();
      }
      this.wheel(ctx, 677, 301, p.wheelAngle, !game.has('brace'));
      this.timber(ctx, 505, 302, 5, game.groundAt(505) - 302); this.timber(ctx, 630, 302, 5, game.groundAt(630) - 302);
      this.channel(ctx, game, 'mill', 500, 259);
      this.timber(ctx, 486, game.state.gate ? 272 : 286, 11, 5);
      ctx.fillStyle = '#4d5049'; ctx.fillRect(489, 276, 3, game.groundAt(489) - 15 - 276);
      this.rock(ctx, 865, 318, 46, 18);
      if (!game.has('repaired')) this.rock(ctx, 864, 313, 49, 8);
      else if (!game.has('medium')) { ctx.fillStyle = '#a79560'; ctx.fillRect(884, 322, 7, 4); ctx.fillStyle = '#477576'; ctx.fillRect(887, 321, 3, 5); }
      const doorFloor = game.groundAt(978);
      ctx.fillStyle = '#121d1c'; ctx.fillRect(965, doorFloor - 30, 27, 30);
      this.rock(ctx, 961, doorFloor - 34, 5, 35); this.rock(ctx, 991, doorFloor - 34, 5, 35);
      this.rock(ctx, 965, doorFloor - 35, 27, 5);
      this.timber(ctx, 968, doorFloor - 25, 3, 24); this.timber(ctx, 987, doorFloor - 25, 3, 24);
    } else if(p.place==='wetland'){
      // Open, low wetland banks. Reeds are background habitat; the shared ground is the walkable surface.
      for(let x=290;x<755;x+=17){
        const y=wetlandGround(x),h=13+(x*13%19);
        ctx.fillStyle='#425944';ctx.fillRect(x,y-h,1,h);ctx.fillRect(x+3,y-h+6,1,h-6);
        ctx.fillStyle='#727254';ctx.fillRect(x-1,y-h-3,3,5);
      }
      ctx.fillStyle='#293e3a';ctx.fillRect(326,362,258,6);
    } else if(p.place==='order-node'){
      for(const x of [56,144,232,320,408]){
        this.rock(ctx,x,64,5,272);this.rock(ctx,x,92,60,5);
      }
      ctx.fillStyle='#111e1c';ctx.fillRect(239,242,39,88);ctx.fillRect(292,305,26,31);
      ctx.fillStyle='#867f61';ctx.fillRect(248,284,19,2);ctx.fillRect(248,290,14,1);ctx.fillRect(248,297,22,1);
      this.rock(ctx,298,321,16,15);this.rock(ctx,342,307,23,29);
      this.timber(ctx,405,296,23,40);this.timber(ctx,403,310,27,4);
    } else if(p.place==='return-channel'){
      // Recessed inspection channels above a dry, continuous maintenance walkway.
      this.rock(ctx,65,180,353,191);
      ctx.fillStyle='#182a24';ctx.fillRect(70,184,343,185);
    } else if(p.place==='cistern'){
      for(const x of [34,136,268,444]){
        ctx.fillStyle='#25332f';ctx.fillRect(x,16,6,720);
        ctx.fillStyle='#304039';ctx.fillRect(x,16,2,720);
      }
      for(const y of [196,416,640]){
        this.rock(ctx,18,y,444,7);
        ctx.fillStyle='#0e1a18';ctx.fillRect(28,y-56,94,54);ctx.fillRect(288,y-56,134,54);
      }
    } else if (p.place === 'cistern-entry') {
      // Recessed masonry is scenery, not an invisible second walking surface.
      for (const x of [100, 270, 450, 650, 850, 992]) {
        const y = game.groundAt(x);
        ctx.fillStyle = '#26312e'; ctx.fillRect(x - 8, y - 102, 9, 102);
        ctx.fillStyle = '#303932'; ctx.fillRect(x - 9, y - 105, 54, 4);
      }
    } else {
      const clearing = game.terrainProfile === 'forest-clearing-v1';
      this.house(ctx, 318, clearing ? game.groundAt(360) : 333, 90, 54, 'hermit');
      drawForestNpc(ctx, 'hermit', 410, game.groundAt(410), p.tick);
      this.rock(ctx, 250, clearing ? game.groundAt(270) - 6 : 330, 33, 7);
      if (clearing) {
        // Supports meet the trough's existing underside and the shared collision ground.
        // These background props do not introduce hidden player collision shelves.
        for (const [x, w] of [[624, 7], [770, 8]] as const) {
          this.rock(ctx, x, 327, w, game.groundAt(x) - 327 + 1);
        }
      } else {
        this.rock(ctx, 612, 330, 21, 12); this.rock(ctx, 766, 327, 18, 14);
      }
      this.channel(ctx, game, 'practice', 620, 280);
      // The hermit's pronunciation aids use Latin letters, not invented
      // sitelen pona glyphs presented as language-learning ground truth.
      const jugFloor = clearing ? game.groundAt(602) : 331;
      ctx.fillStyle = '#696554'; ctx.fillRect(597, jugFloor - 10, 10, 10); ctx.fillRect(599, jugFloor - 14, 5, 4);
      ctx.fillStyle = '#77735b'; ctx.fillRect(607, jugFloor - 9, 3, 6);
      if (game.has('intro')) { this.teloLabel(ctx, 586, jugFloor - 25); this.teloLabel(ctx, 782, 314); }
      ctx.fillStyle = '#82775e'; ctx.fillRect(717, clearing ? game.groundAt(720) - 3 : 326, 10, 3);
      this.lantern(ctx, 439, 319, p.tick);
    }
    const groundKey = `${p.place}:${game.terrainProfile ?? 'legacy'}:${p.place==='cistern'&&game.hasRoom('lift_open')}`;
    let ground = this.terrain.get(groundKey);
    if (!ground) { ground = this.makeGround(game); this.terrain.set(groundKey, ground); }
    ctx.drawImage(ground, 0, 0);
    if (p.place === 'cistern-entry') { this.cisternEntryProps(ctx, game); this.cisternWindow(ctx, game, windowPlan); }
    if(p.place==='cistern')this.cisternRoom(ctx,game,windowPlan);
    if(p.place==='return-channel')this.returnChannel(ctx,game);
    if(p.place==='wetland')this.wetland(ctx,game);
    if (p.place === 'mill' && p.tailrace) {
      for (const i of p.tailrace.drops) {
        const x = MILL_TAILRACE.x + i % MILL_TAILRACE.width, y = MILL_TAILRACE.y + Math.floor(i / MILL_TAILRACE.width);
        ctx.fillStyle = (x + y) % 9 === 0 ? '#80a6a6' : '#507e87';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const t of game.targets) {
      if (t.id.endsWith('road') || t.id === 'return'||t.id==='top-exit'||t.id==='cistern-shortcut') {
        const y = game.targetFloor(t);
        this.timber(ctx, t.x - 1, y - 23, 3, 23); this.timber(ctx, t.x - 13, y - 23, 26, 9);
        ctx.fillStyle = '#aca079'; ctx.fillRect(t.x - 6, y - 19, 12, 1);
        ctx.fillRect(t.x + (t.x < 200 ? -6 : 5), y - 20, 1, 3);
      }
    }
    if(p.place==='mill'&&game.hasRoom('return_open')){
      const floor=game.groundAt(812);
      ctx.fillStyle='#16221c';ctx.fillRect(801,floor-29,22,29);
      this.timber(ctx,799,floor-31,3,31);this.timber(ctx,823,floor-31,3,31);
      for(let y=floor-26;y<floor;y+=6){ctx.fillStyle='#a09872';ctx.fillRect(805,y,15,2);}
      ctx.fillStyle='#65735c';ctx.fillRect(805,floor-29,2,29);ctx.fillRect(818,floor-29,2,29);
    }
    ctx.restore();
    if (this.atlas) drawForestOpeningLocalTraveler(ctx, view, this.atlas);
    else drawForestOpeningCandidateTraveler(ctx, view);
    const near = game.nearest();
    if (near) {
      const x = Math.round(near.x - camera.x), y = Math.round(game.targetFloor(near) - camera.y - 36);
      ctx.fillStyle = '#d0c495'; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
    }
  }
  private makeGround(game: ForestEpisode): HTMLCanvasElement {
    if(game.state.place==='order-node'){
      const c=document.createElement('canvas');c.width=448;c.height=352;
      const target=c.getContext('2d')!,im=target.createImageData(c.width,c.height);
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(orderNodeSolid(x,y)){
        const rgb=forestMaterialColor(M.stone,x,y,{top:y===336?1:0,side:x===5||x===442,bottom:y===63});
        const shade=y<48?.45:1;im.data.set([rgb[0]*shade,rgb[1]*shade,rgb[2]*shade,255],(y*c.width+x)*4);
      }
      target.putImageData(im,0,0);return c;
    }
    if(game.state.place==='cistern'){
      const c=document.createElement('canvas');c.width=480;c.height=768;
      const target=c.getContext('2d')!,im=target.createImageData(480,768);
      const solid=(x:number,y:number)=>cisternRoomSolid(x,y,true,game.hasRoom('lift_open'));
      for(let y=0;y<768;y++)for(let x=0;x<480;x++){
        if(!solid(x,y))continue;
        const top=!solid(x,y-1),edge=!solid(x-1,y)||!solid(x+1,y);
        const rgb=forestMaterialColor(M.stone,x,y,{top:top?1:0,side:edge,bottom:!solid(x,y+1)});
        const depth=x<16?16-x:x>=464?x-464:y>=736?y-736:y<16?16-y:4;
        const shade=Math.max(.36,1-depth*.026);
        im.data.set([rgb[0]*shade,rgb[1]*shade,rgb[2]*shade,255],(y*480+x)*4);
      }
      target.putImageData(im,0,0);return c;
    }
    const place = game.state.place;
    if (place === 'cistern-entry') return this.makeCisternEntryGround();
    const c = document.createElement('canvas'); c.width = 1024; c.height = 480;
    const ctx = c.getContext('2d')!, image = ctx.createImageData(1024, 480);
    for (let x = 0; x < 1024; x++) {
      const floor = game.groundAt(x);
      for (let y = floor; y < 480; y++) {
        const valley = place === 'mill' && hasMillValley(game.terrainProfile);
        // Dithered damp-bank edge, rather than a ruler-straight wet/dry material seam.
        const wetness = Math.max(0, Math.min(1, (x - 470) / 70, (780 - x) / 70));
        const grain = (Math.imul(x + 31, 374761393) ^ Math.imul(y + 7, 668265263)) >>> 0;
        let rgb = forestEarthProfile(x, y - floor, floor, place === 'mill' && (valley ? grain % 256 < wetness * 256 : x > 480 && x < 760));
        if (valley && millDrainInterior(x, y)) rgb = [19, 28, 29];
        else if (valley && millDrainLining(x, y)) rgb = forestMaterialColor(M.stone, x, y, { top: y === 394 ? 1 : 0, side: true, bottom: false });
        const i = (y * 1024 + x) * 4; image.data[i] = rgb[0]; image.data[i + 1] = rgb[1]; image.data[i + 2] = rgb[2]; image.data[i + 3] = 255;
      }
      const seed = (Math.imul(x + 7, 1274126177) >>> 9) >>> 0;
      const clearing = (place === 'settlement' && ((x > 265 && x < 375) || (x > 635 && x < 740))) ||
        (place === 'hermit' && game.terrainProfile === 'forest-clearing-v1' && hermitClearingPad(x));
      const clump = Math.sin(x / 23) + Math.sin(x / 9) > -.2;
      if (!clearing && clump && seed % 11 < 3 && (place !== 'mill' || x < 230 || x > 940)) {
        for (let h = 1; h < 2 + seed % 5; h++) { const i = ((floor - h) * 1024 + x) * 4; image.data.set([58 + seed % 13, 69 + seed % 11, 35, 255], i); }
      } else if (seed % 41 < 2) {
        const i = ((floor - 1) * 1024 + x) * 4; image.data.set([105, 82, 43, 255], i);
      }
    }
    ctx.putImageData(image, 0, 0); return c;
  }
  private wetland(ctx:CanvasRenderingContext2D,game:ForestEpisode):void{
    const s=game.state.migration!;
    // Damp nest, small tracks, rope and displaced log are stable native-pixel landmarks.
    for(let i=0;i<18;i++){ctx.fillStyle=i%3?'#706346':'#4c4d34';ctx.fillRect(136+i,350-i%3,2,1);}
    for(let x=198;x<234;x+=7){ctx.fillStyle='#a18e68';ctx.fillRect(x,wetlandGround(x)-1,2,1);}
    this.timber(ctx,247,wetlandGround(252)-13,4,13);
    ctx.strokeStyle='#8b7d58';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(250,wetlandGround(252)-8);
    ctx.lineTo(493,game.hasMigration('cleared')?380:363);ctx.stroke();
    this.timber(ctx,483,game.hasMigration('cleared')?376:358,42,7);
    const y=wetlandGround(540);
    ctx.fillStyle='#101d1b';ctx.fillRect(528,y-30,25,30);
    this.rock(ctx,524,y-34,5,34);this.rock(ctx,553,y-34,5,34);this.rock(ctx,528,y-35,25,5);
    const controls=game.migrationControls;
    for(const young of [false,true]){
      if(young?!controls.youngAlive:!controls.adultAlive)continue;
      const b=migrationBody(young?s.youngX:s.adultX,young),x=Math.floor(b.x),foot=Math.floor(b.y+b.height);
      const w=b.width,h=b.height,moving=s.mode==='fleeing';
      const stride=moving?Math.round(Math.sin(s.age*.14+(young?1:0))*2):0;
      ctx.fillStyle=young?'#776c4e':'#555d49';
      ctx.fillRect(x+3,foot-h+2,w-7,h-5);ctx.fillRect(x+6,foot-h,w-14,2);
      ctx.fillStyle=young?'#918063':'#73765a';ctx.fillRect(x+6,foot-h+2,w-16,2);
      ctx.fillStyle=young?'#655a41':'#424c3b';ctx.fillRect(x+w-8,foot-h+3,8,young?5:9);
      // Broad tail and two distinct feet; warning tail slap stays inside the same ground envelope.
      ctx.fillRect(x,foot-5-(s.mode==='warning'&&s.age%40<12?2:0),young?4:9,3);
      ctx.fillStyle='#262f29';ctx.fillRect(x+5+stride,foot-3,young?3:5,3);
      ctx.fillRect(x+w-9-stride,foot-3,young?3:5,3);
      ctx.fillStyle='#b5a26e';ctx.fillRect(x+w-3,foot-h+4,1,1);
    }
  }
  private makeCisternEntryGround(): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 480;
    const ctx = c.getContext('2d')!, image = ctx.createImageData(c.width, c.height);
    for (let x = 0; x < c.width; x++) {
      const floor = cisternEntryFloor(x), ceiling = cisternEntryCeiling(x);
      for (let y = 0; y < c.height; y++) {
        if (!cisternEntrySolid(x, y, true)) continue;
        const depth = Math.min(Math.abs(y - floor), Math.abs(y - ceiling));
        const rgb = forestBuriedColor(M.stone, x, y, depth, { top: y === floor ? 1 : 0, bottom: y === ceiling, side: x === 7 || x === 1008 });
        image.data.set([...rgb, 255], (y * c.width + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0); return c;
  }
  private cisternEntryProps(ctx: CanvasRenderingContext2D, game: ForestEpisode): void {
    const floor = (x: number) => game.groundAt(x);
    // Hand tools and lamps belong to the environment; the traveler never emits light.
    for (const x of [110, 330, 680, 910]) this.lantern(ctx, x, floor(x) - 16, game.state.tick);
    this.rock(ctx, 248, floor(260) - 27, 24, 24);
    ctx.fillStyle = '#969780';
    ctx.fillRect(254, floor(260) - 21, 12, 1); ctx.fillRect(254, floor(260) - 16, 8, 1);
    ctx.fillRect(263, floor(260) - 19, 1, 5);
    const fy = floor(490);
    this.timber(ctx, 483, fy - 20, 4, 20); this.timber(ctx, 497, fy - 20, 4, 20);
    this.timber(ctx, 479, fy - 22, 27, 4);
    ctx.fillStyle = '#8a8c7c'; ctx.fillRect(490, fy - 28, 3, 17); ctx.fillRect(482, fy - 20, 19, 3);
    // Cable terminates at the guide rail. Raised bars remain in the solid roof recess.
    const { left, right } = CISTERN_ENTRY_GATE, top = cisternEntryCeiling(left);
    ctx.fillStyle = '#666b60'; ctx.fillRect(499, fy - 29, left - 499, 1);
    for (let x = left; x < right; x += 4) {
      const bottom = game.has('entry_open') ? cisternEntryCeiling(x) : floor(x);
      const start = game.has('entry_open') ? bottom - 14 : top + 1;
      ctx.fillStyle = '#737b70'; ctx.fillRect(x, start, 2, bottom - start);
      ctx.fillStyle = '#414e47'; ctx.fillRect(x + 1, start, 1, bottom - start);
    }
    if (!game.has('entry_open')) {
      ctx.fillStyle = '#788172'; ctx.fillRect(left, top + 22, right - left, 3);
      ctx.fillRect(left, floor(left) - 16, right - left, 3);
    }
    const sealFloor = floor(890);
    ctx.fillStyle = '#121c1b'; ctx.fillRect(874, sealFloor - 49, 33, 49);
    this.rock(ctx, 870, sealFloor - 53, 5, 54); this.rock(ctx, 907, sealFloor - 53, 5, 54);
    this.rock(ctx, 874, sealFloor - 54, 34, 6);
    ctx.fillStyle = '#3e4840'; ctx.fillRect(880, sealFloor - (game.has('window_filled') ? 52 : 34), 21, 22);
    ctx.fillStyle = '#151f1c'; ctx.fillRect(887, sealFloor - 29, 5, 9); ctx.fillRect(884, sealFloor - 27, 11, 5);
  }
  private cisternWindow(ctx: CanvasRenderingContext2D, game: ForestEpisode, plan: TeloCastPlan | null): void {
    const {x:ox,y:oy}=CISTERN_WINDOW;
    // Wall-mounted inspection apparatus, not another player collision floor.
    ctx.fillStyle='#101b1b'; ctx.fillRect(ox,oy,128,64);
    const cells=game.windowCells;
    for(let y=0;y<32;y++) for(let x=0;x<64;x++) {
      const material=cells[y*64+x];
      if(material===Material.Air)continue;
      if(material===Material.Water) {
        ctx.fillStyle=(x+y)%7===0?'#7da8ad':'#3e7782'; ctx.fillRect(ox+x*2,oy+y*2,2,2);
      } else {
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
          const rgb=forestMaterialColor(M.stone,ox+x*2+dx,oy+y*2+dy);
          ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(ox+x*2+dx,oy+y*2+dy,1,1);
        }
      }
    }
    ctx.fillStyle='#a8976a'; ctx.fillRect(ox+16,oy+15,4,2);
    for(let d=0;d<=64;d+=16)ctx.fillRect(ox+20+d,oy+2,1,3);
    ctx.fillStyle='#807e62';ctx.fillRect(815,350,11,2);ctx.fillRect(820,345,2,12);
    if(plan){
      const len=plan.requestedLengthClass==='short'?16:plan.requestedLengthClass==='long'?64:32;
      ctx.strokeStyle=plan.canConfirm?'#abc8bb':'#d7aa70';ctx.lineWidth=1;ctx.setLineDash([2,2]);
      ctx.strokeRect(ox+20.5,oy+10.5,len,12);ctx.setLineDash([]);
    }
  }
  private cisternRoom(ctx:CanvasRenderingContext2D,game:ForestEpisode,plan:TeloCastPlan|null):void{
    for(const [x,top,bottom] of [[416,528,736],[56,336,544]]){
      this.timber(ctx,x-13,top,3,bottom-top);this.timber(ctx,x+11,top,3,bottom-top);
      for(let y=top+5;y<bottom;y+=9)this.timber(ctx,x-11,y,23,2);
    }
    for(const p of CISTERN_PLATFORMS){
      ctx.fillStyle='#7d816b';
      if(p.y===128&&game.hasRoom('lift_open')){ctx.fillRect(p.x,p.y,400-p.x,1);ctx.fillRect(448,p.y,16,1);}
      else ctx.fillRect(p.x,p.y,p.w,1);
    }
    if(!game.hasRoom('valve_filled')){
      for(let x=32;x<80;x+=6){ctx.fillStyle='#7c8477';ctx.fillRect(x,368,2,16);}
      ctx.fillStyle='#525e53';ctx.fillRect(32,368,48,3);
    }
    for(const [x,y] of [[74,701],[344,511],[145,322]])this.lantern(ctx,x,y,game.state.tick);
    this.roomWater(ctx,game.echoCells,80,662,null);
    this.roomWater(ctx,game.calibrationCells,CISTERN_CALIBRATION.x,CISTERN_CALIBRATION.y,game.nearest()?.id==='calibration'?plan:null);
    if(game.calibrationVersion===2){
      // Copper contact and linkage identify the real remote intake, distinct from the near recovery trough.
      ctx.fillStyle='#a18b60';ctx.fillRect(224,485,3,3);ctx.fillRect(225,483,12,1);ctx.fillRect(236,483,1,19);
      ctx.fillStyle='#c2ba8f';ctx.fillRect(218,510,2,1);ctx.fillRect(218,518,2,1);
      ctx.fillStyle='#616f64';ctx.fillRect(241,510,14,1);
    }
    for(const x of [174,306])this.rock(ctx,x,534,5,10);
    ctx.fillStyle='#92906d';ctx.fillRect(178,522,3,18);ctx.fillRect(172,526,15,2);
    this.siphonWater(ctx,game,game.nearest()?.id==='siphon'?plan:null);
    this.timber(ctx,398,116,3,236);this.timber(ctx,447,116,3,236);
    const deck=game.state.lift?.y??352;
    this.timber(ctx,400,deck,48,8);ctx.fillStyle='#a8b299';ctx.fillRect(400,deck,48,1);
    ctx.fillStyle=game.hasRoom('siphon_primed')?'#9fb693':'#715c3f';ctx.fillRect(451,323,3,9);ctx.fillRect(373,100,3,10);
    if(!game.hasRoom('lift_open')){ctx.fillStyle='#b49b67';ctx.fillRect(437,333,5,8);ctx.fillRect(436,331,7,2);}
    // Top crank and actual two-way route: no fake continuation into the unopened mine.
    this.timber(ctx,97,105,5,23);ctx.fillStyle='#a19b72';ctx.fillRect(89,113,20,2);ctx.fillRect(96,108,2,13);
    ctx.fillStyle=game.hasRoom('return_open')?'#16271d':'#635f4b';ctx.fillRect(259,91,26,37);
    this.timber(ctx,256,90,3,38);this.timber(ctx,285,90,3,38);this.timber(ctx,256,88,32,3);
    const bottom=game.hasRoom('return_open')?128:102;
    for(let y=96;y<bottom;y+=6){ctx.fillStyle='#afa27c';ctx.fillRect(265,y,15,2);}
    ctx.fillStyle='#6d7360';ctx.fillRect(265,92,2,bottom-92);ctx.fillRect(278,92,2,bottom-92);
    ctx.fillStyle=game.siphonReleased?'#9faf90':'#9a8666';ctx.fillRect(413,327,2,14);ctx.fillRect(408,331,12,2);
  }
  private siphonWater(ctx:CanvasRenderingContext2D,game:ForestEpisode,plan:TeloCastPlan|null):void{
    const {x:ox,y:oy,columns,rows,width,height,anchor,contact}=CISTERN_SIPHON,cells=game.siphonCells;
    ctx.fillStyle='#101b1b';ctx.fillRect(ox,oy,width,height);
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const m=cells[y*columns+x];if(m===Material.Air)continue;
      if(m===Material.Water){ctx.fillStyle=(x+y)%7?'#3c7380':'#789e9e';ctx.fillRect(ox+x*2,oy+y*2,2,2);}
      else for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const rgb=forestMaterialColor(M.stone,ox+x*2+dx,oy+y*2+dy);
        ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(ox+x*2+dx,oy+y*2+dy,1,1);
      }
    }
    // Copper water-contact linkage, receiver marks and dry recovery-trough rim.
    ctx.fillStyle=game.siphonReleased?'#bac89d':'#b09865';
    ctx.fillRect(ox+contact.x*2,oy+contact.y*2,2,3);
    ctx.fillRect(ox+contact.x*2,oy+16,49,1);ctx.fillRect(ox+130,oy+16,1,13);
    ctx.fillStyle='#a79971';ctx.fillRect(ox+anchor.x-3,oy+anchor.y-1,3,2);
    for(let d=0;d<=64;d+=16)ctx.fillRect(ox+anchor.x+d,oy+5,1,3);
    ctx.fillStyle='#a7af93';for(let y=306;y<=328;y+=8)ctx.fillRect(283,y,3,1);
    ctx.fillStyle='#56685f';ctx.fillRect(182,318,48,1);
    for(const [x,ready] of [[162,game.hasRoom('siphon_left')],[286,game.hasRoom('siphon_right')]] as const){
      this.timber(ctx,x-3,336,3,16);this.timber(ctx,x+3,336,3,16);
      ctx.fillStyle=ready?'#b6b08b':'#605a45';ctx.fillRect(x-4,342,11,2);
      if(ready){ctx.fillRect(x-1,338,2,12);ctx.fillRect(x-3,348,7,2);}
      else{ctx.fillStyle='#152321';ctx.fillRect(x,342,3,2);}
    }
    if(plan){
      const length=plan.requestedLengthClass==='short'?16:plan.requestedLengthClass==='long'?64:32;
      ctx.strokeStyle=plan.canConfirm&&(plan.requestedLengthClass!=='long'||game.siphonSupported)?'#acd0bb':'#c7a06d';
      ctx.lineWidth=1;ctx.setLineDash([2,2]);ctx.strokeRect(ox+anchor.x+.5,oy+anchor.y-5.5,length,12);ctx.setLineDash([]);
    }
  }
  private roomWater(ctx:CanvasRenderingContext2D,cells:readonly number[],ox:number,oy:number,plan:TeloCastPlan|null):void{
    ctx.fillStyle='#0f1a1a';ctx.fillRect(ox,oy,144,64);
    for(let y=0;y<32;y++)for(let x=0;x<72;x++){
      const m=cells[y*72+x];if(m===Material.Air)continue;
      if(m===Material.Water){ctx.fillStyle=(x+y)%7?'#3c7380':'#789e9e';ctx.fillRect(ox+x*2,oy+y*2,2,2);}
      else for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const rgb=forestMaterialColor(M.stone,ox+x*2+dx,oy+y*2+dy);
        ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(ox+x*2+dx,oy+y*2+dy,1,1);
      }
    }
    ctx.fillStyle='#b2a171';ctx.fillRect(ox+84,oy+15,4,2);
    for(let d=0;d<=64;d+=16)ctx.fillRect(ox+84-d,oy+2,1,3);
    if(plan){
      const length=plan.requestedLengthClass==='short'?16:plan.requestedLengthClass==='long'?64:32;
      ctx.strokeStyle=plan.canConfirm?'#acd0bb':'#c7a06d';ctx.lineWidth=1;ctx.setLineDash([2,2]);
      ctx.strokeRect(ox+84-length+.5,oy+10.5,length,12);ctx.setLineDash([]);
    }
  }
  private returnChannel(ctx:CanvasRenderingContext2D,game:ForestEpisode):void{
    const s=game.state.returnFlow!;const rates=returnChannelRates(s);
    for(const part of ['upstream','supply','meadow'] as const){
      const o=RETURN_CHANNEL_PORTS[part],controls=returnChannelControls(part,game.flowControls);
      ctx.fillStyle='#10231f';ctx.fillRect(o.x,o.y,160,48);
      for(let y=0;y<48;y++)for(let x=0;x<160;x++){
        if(episodeWaterSolid(x,y,controls)){
          const rgb=forestMaterialColor(M.stone,x+o.x,y+o.y);
          ctx.fillStyle='rgb('+rgb.join(',')+')';
        }else if(s[part].cells[y*160+x])ctx.fillStyle=(x+y)%9===0?'#8fb7b6':'#50838c';
        else continue;
        ctx.fillRect(o.x+x,o.y+y,1,1);
      }
      this.timber(ctx,o.x-3,o.y+48,166,3);
    }
    // The port coupling is explicit mechanical routing, not extra simulated water.
    ctx.strokeStyle=game.hasFlow('sealed')?'#809279':'#9b7351';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(239,251);ctx.lineTo(245,251);ctx.lineTo(245,317);ctx.stroke();
    ctx.beginPath();ctx.moveTo(245,249);ctx.lineTo(253,249);ctx.moveTo(245,317);ctx.lineTo(253,317);ctx.stroke();
    for(const [x,flag,top] of [[144,'gate',232],[208,'sealed',255],[272,'cleared',358]] as const){
      ctx.fillStyle='#5b6555';ctx.fillRect(x,top,1,398-top);
      this.timber(ctx,x-7,384,15,3);
      ctx.fillStyle=game.hasFlow(flag)?'#9cab7f':'#b79368';ctx.fillRect(x-2,380,5,3);
    }
    this.timber(ctx,76,374,17,10);this.timber(ctx,83,383,2,17);
    for(const [y,value] of [[290,rates.supply],[358,rates.meadow]]){
      this.rock(ctx,410,y!-5,17,8);ctx.fillStyle='#162b28';ctx.fillRect(412,y!-3,13,3);
      ctx.fillStyle='#8ca78c';ctx.fillRect(432,y!-26,2,26);
      for(let j=0;j<5;j++)ctx.fillRect(429,y!-j*5,6,1);
      ctx.fillStyle='#d4c396';ctx.fillRect(428,y!-Math.min(24,Math.floor(value!/5)),8,2);
    }
    for(let x=359;x<432;x+=7){
      const h=7+x%13;ctx.fillStyle=game.hasFlow('restored')?'#637d52':'#665d3e';
      ctx.fillRect(x,400-h,1,h);ctx.fillRect(x-2,399-h,3,3);
    }
    ctx.fillStyle=game.hasFlow('restored')?'#426c71':'#323c2b';ctx.fillRect(365,396,61,3);
    this.rock(ctx,450,369,5,31);this.rock(ctx,476,366,4,34);this.rock(ctx,450,365,30,5);
    ctx.fillStyle='#101d19';ctx.fillRect(455,370,20,30);this.timber(ctx,455,382,20,3);
  }
  private channel(ctx: CanvasRenderingContext2D, game: ForestEpisode, kind: 'mill' | 'practice', ox: number, oy: number): void {
    const controls = game.controls(kind), water = game.state[kind];
    for (let y = 0; y < 48; y++) for (let x = 0; x < 160; x++) {
      if (episodeWaterSolid(x, y, controls)) {
        const rgb = forestMaterialColor(kind === 'mill' ? M.wood : M.stone, x + ox, y + oy);
        ctx.fillStyle = `rgb(${rgb.join(',')})`;
      } else if (water.cells[y * 160 + x]) ctx.fillStyle = (x + y) % 9 === 0 ? '#54848a' : '#346b75';
      else continue;
      ctx.fillRect(x + ox, y + oy, 1, 1);
    }
  }
  private teloLabel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const letters = ['010111010010011', '000111101110011', '110010010010011', '000010101101010'];
    ctx.fillStyle = '#343b31'; ctx.fillRect(x - 2, y - 2, 20, 9); ctx.fillStyle = '#b1a584';
    letters.forEach((mask, column) => [...mask].forEach((bit, i) => { if (bit === '1') ctx.fillRect(x + column * 4 + i % 3, y + Math.floor(i / 3), 1, 1); }));
  }
  private timber(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const key = `${w}:${h}`; let texture = this.wood.get(key);
    if (!texture) {
      texture = document.createElement('canvas'); texture.width = w; texture.height = h;
      const target = texture.getContext('2d')!, image = target.createImageData(w, h);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const rgb = forestMaterialColor(M.wood, w > h ? dx : dy, w > h ? dy : dx);
        const shade = dx === w - 1 || dy === h - 1 ? .62 : 1;
        image.data.set([rgb[0] * shade, rgb[1] * shade, rgb[2] * shade, 255], (dy * w + dx) * 4);
      }
      target.putImageData(image, 0, 0); this.wood.set(key, texture);
    }
    ctx.drawImage(texture, Math.round(x), Math.round(y));
  }
  private rock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (dy < 2 && (dx < 3 || dx > w - 5)) continue;
      const rgb = forestMaterialColor(M.stone, x + dx, y + dy, { top: dy === 0 ? 1 : 0, side: dx === 0, bottom: dy === h - 1 });
      ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
  private house(ctx: CanvasRenderingContext2D, x: number, floor: number, w: number, h: number, kind: ForestBuildingKind): void {
    drawForestBuilding(ctx, x, floor, w, h, kind);
  }
  private fence(ctx: CanvasRenderingContext2D, x: number, w: number, ground: (x: number) => number): void {
    for (let i = 0; i < w; i++) { ctx.fillStyle = '#604a30'; ctx.fillRect(x + i, ground(x + i) - 15, 1, 3); }
    for (let i = 0; i < w; i += 30) this.timber(ctx, x + i, ground(x + i) - 21, 4, 21);
  }
  private wheel(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, loose: boolean): void {
    // Integer raster of rotating spokes/paddles avoids smooth vector arcs in the pixel world.
    for (let i = 0; i < 160; i++) {
      const a = i * Math.PI * 2 / 160;
      ctx.fillStyle = i % 4 ? '#735936' : '#9a7847'; ctx.fillRect(Math.round(x + Math.cos(a) * 29), Math.round(y + Math.sin(a) * 29), 2, 2);
    }
    for (let spoke = 0; spoke < 10; spoke++) {
      const a = angle + spoke * Math.PI / 5;
      for (let r = 0; r < 33; r++) { ctx.fillStyle = r > 27 ? '#8e6e43' : '#59432f'; ctx.fillRect(Math.round(x + Math.cos(a) * r + (loose ? Math.sin(angle * 3) : 0)), Math.round(y + Math.sin(a) * r), r > 27 ? 4 : 2, 2); }
    }
    ctx.fillStyle = '#858274'; ctx.fillRect(x - 3, y - 3, 7, 7); ctx.fillStyle = '#3a3a34'; ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  private lantern(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number): void {
    this.timber(ctx, x, y - 16, 3, 32); this.timber(ctx, x, y - 16, 15, 3);
    ctx.fillStyle = '#83733e'; ctx.fillRect(x + 10, y - 11, 6, 10);
    ctx.fillStyle = tick % 60 < 30 ? '#c2aa68' : '#b39b5e'; ctx.fillRect(x + 12, y - 9, 2, 6);
  }
}
