import { type Aabb } from '../runtime/geometry';
import { forestBodyOverlapsBounds, type ForestBodyShape } from './forest-body-shape';

export interface ForestBodyState {
  readonly id: 'stream.stone.a' | 'stream.stone.b' | 'stream.deadwood';
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly vx: number; readonly vy: number;
  readonly touched: boolean; readonly restTicks: number;
}

export interface ForestBodyWorld {
  solid(bounds: Aabb, except: ForestBodyState['id']): boolean;
  wet(bounds: Aabb): number;
  admit(bounds: Aabb, except: ForestBodyState['id']): boolean;
}

export function readForestBodies(value: unknown): readonly ForestBodyState[] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('forest bodies invalid');
  const ids = ['stream.stone.a', 'stream.stone.b', 'stream.deadwood'];
  return Object.freeze(value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Object.keys(raw).sort().join() !==
      ['id','x','y','width','height','vx','vy','touched','restTicks'].sort().join()) throw new Error('forest body fields invalid');
    if (raw.id !== ids[index] || raw.width !== (index === 2 ? 40 : 12) || raw.height !== (index === 2 ? 6 : 12) ||
      typeof raw.touched !== 'boolean' || !Number.isSafeInteger(raw.restTicks) || raw.restTicks < 0 || raw.restTicks > 120 ||
      ![raw.x, raw.y, raw.vx, raw.vy].every(Number.isFinite) || raw.x < 1712 || raw.x + raw.width > 2128 ||
      raw.y < 620 || raw.y + raw.height > 800 || Math.abs(raw.vx) > 120 || Math.abs(raw.vy) > 160) throw new Error('forest body state invalid');
    return Object.freeze({ ...raw }) as ForestBodyState;
  }));
}

export function initialForestBodies(): readonly ForestBodyState[] {
  return readForestBodies([
    { id:'stream.stone.a', x:1788, y:701, width:12, height:12, vx:0, vy:0, touched:false, restTicks:0 },
    { id:'stream.stone.b', x:1810, y:701, width:12, height:12, vx:0, vy:0, touched:false, restTicks:0 },
    { id:'stream.deadwood', x:1940, y:698, width:40, height:6, vx:0, vy:0, touched:false, restTicks:0 },
  ]);
}

export function pushForestBody(body: ForestBodyState, direction: -1 | 1): ForestBodyState {
  // One bounded impulse, never a destination. Repeated actions can change the outcome.
  return Object.freeze({ ...body, vx: direction * (body.id === 'stream.deadwood' ? 66 : 72),
    touched:true, restTicks:0 });
}

export function stepForestBody(body: ForestBodyState, world: ForestBodyWorld, actor?: Aabb, shape: ForestBodyShape = 'box-v1'): ForestBodyState {
  const next = { ...body };
  const wet = world.wet(body);
  const wood = body.id === 'stream.deadwood';
  // Sample water around/under the body: its occupied pixels are displaced, not liquid.
  const acceleration = 400 * (1 - wet * (wood ? 1.6 : 0.42));
  next.vy = Math.max(-90, Math.min(160, (next.vy + acceleration / 60) * Math.exp(-wet * 5 / 60)));
  const grounded = world.solid({ ...body, y:body.y + 0.05 }, body.id);
  // Resting contact needs one support check, not a fresh 12-iteration sweep
  // every tick. Removed support, an impulse or upward buoyancy wakes it.
  if(body.vx===0 && body.vy===0 && acceleration>=0 && grounded &&
    world.solid({...body,y:body.y+0.00001},body.id)) {
    return Object.freeze({...body,restTicks:Math.min(120,body.restTicks+1)});
  }
  const resistance = wet * 1.7 + (grounded ? wood ? 0.9 : 1.8 : 0.08);
  next.vx *= Math.exp(-resistance / 60);
  if (Math.abs(next.vx) < 0.04) next.vx = 0;
  const blocked = (candidate: Aabb) => world.solid(candidate, body.id) ||
    !!actor && forestBodyOverlapsBounds({...candidate,id:body.id}, shape, actor) && !forestBodyOverlapsBounds(body, shape, actor);
  for (const axis of ['x','y'] as const) {
    const speed = axis === 'x' ? 'vx' : 'vy';
    let remaining = next[speed] / 60;
    while (Math.abs(remaining) > 1e-7) {
      const delta = Math.sign(remaining) * Math.min(0.5, Math.abs(remaining));
      const candidate = { ...next, [axis]:next[axis] + delta };
      if (blocked(candidate)) {
        // Hand-dragged wood can rock over a low bank lip. Apply an upward contact
        // impulse, not an instant positional lift; a tall wall still blocks it.
        if(axis==='x' && wood && body.touched && Math.abs(next.vx)>8) {
          let lowLip=false;
          for(let lift=1;lift<=6;lift++) if(!blocked({...candidate,y:next.y-lift}) && !blocked({...next,y:next.y-lift})) {lowLip=true;break;}
          if(lowLip) {next.vy=-70;next.vx*=0.92;break;}
        }
        let safe = 0, hit = 1;
        for (let i=0;i<12;i++) { const t=(safe+hit)/2;
          if (blocked({ ...next, [axis]:next[axis]+delta*t })) hit=t; else safe=t; }
        const contact = { ...next, [axis]:next[axis]+delta*safe };
        const pixel=Math.round(contact[axis]);
        if(Math.abs(pixel-contact[axis])<0.0002 && !blocked({...contact,[axis]:pixel})) contact[axis]=pixel;
        if (world.admit(contact, body.id)) next[axis]=contact[axis];
        next[speed]=0; break;
      }
      if (!world.admit(candidate, body.id)) { next[speed]=0; break; }
      next[axis]=candidate[axis]; remaining-=delta;
    }
  }
  next.restTicks = Math.abs(next.vx)<1.5 && Math.abs(next.vy)<1.5 ? Math.min(120,body.restTicks+1) : 0;
  return Object.freeze(next);
}
