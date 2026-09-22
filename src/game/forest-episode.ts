import { sha256Canonical, type JsonValue } from '../canonical-json';
import { GameSession, type GameSessionSave, type GameSessionState } from '../session/game-session';
import { commitSessionProposal, type SessionEventDraft } from '../session/adapters';
import { PrologueForestOpeningSession } from './prologue-forest-opening';
import { stepPlayerMotion, EMPTY_JUMP_GRACE, type PlayerMotionState, type PlayerMotionInput, type PlayerJumpGrace } from '../runtime/player-motion';
import type { PlayerState } from '../runtime/runtime';
import type { Aabb } from '../runtime/geometry';
import { woodlandMeadowY, type ForestSurfaceProfile } from '../world/forest-surface-profile';
import { advanceEpisodeWater, emptyEpisodeWater, supplyEpisodeWater, collectedEpisodeWater,
  validateEpisodeWater, type EpisodeWaterState, type EpisodeWaterControls } from '../world/forest-episode-water';

export const EPISODE_SAVE_KEY = 'tokipona.forest-waterwheel-episode.v0.1';
export const OPENING_SAVE_KEY = 'tokipona.forest-opening.vertical-slice.v0.1';
export const EPISODE_BOUNDS = { x: 0, y: 0, width: 1024, height: 480 } as const;
export type EpisodePlace = 'settlement' | 'mill' | 'hermit';
export const EPISODE_PLACES = { settlement: '林间聚落', mill: '旧水轮工坊', hermit: '隐士林地' } as const;
export type EpisodeTarget = 'worker' | 'mill-road' | 'hermit-road' | 'return' | 'timber' | 'brace' | 'gate' | 'silt' | 'medium' | 'hermit' | 'pool' | 'plug' | 'rest';
export const EPISODE_TARGETS: Readonly<Record<EpisodePlace, readonly { id: EpisodeTarget; x: number; label: string }[]>> = {
  settlement: [{ id: 'hermit-road', x: 60, label: '西侧林间小径' }, { id: 'worker', x: 350, label: '工务人' }, { id: 'mill-road', x: 920, label: '沿水渠去工坊' }],
  mill: [{ id: 'return', x: 60, label: '返回聚落' }, { id: 'timber', x: 270, label: '备用木撑' }, { id: 'gate', x: 490, label: '水渠闸柄' },
    { id: 'silt', x: 585, label: '渠道淤堵' }, { id: 'brace', x: 690, label: '水轮支架' }, { id: 'medium', x: 890, label: '检修石龛' }],
  hermit: [{ id: 'return', x: 60, label: '返回聚落' }, { id: 'rest', x: 270, label: '林下坐垫' }, { id: 'hermit', x: 410, label: '隐士' },
    { id: 'pool', x: 620, label: '练习石槽' }, { id: 'plug', x: 720, label: '漏口与木楔' }],
};
const FLAG = 'forest.episode.';
const CHECKS = ['job', 'timber', 'brace', 'cleared', 'repaired', 'medium', 'route', 'intro', 'observed', 'predicted', 'plugged', 'practiced', 'debrief', 'finished'] as const;
export type EpisodeFlag = typeof CHECKS[number];
export function episodeGround(place: EpisodePlace, x: number, profile?: ForestSurfaceProfile): number {
  if (place === 'settlement' && profile === 'woodland-v2') return woodlandMeadowY(x);
  // A shallow walkable ground profile, shared by drawing and collision. No decorative collision floors.
  if (place === 'mill') return 336;
  return 336 + Math.round(Math.sin(x / 100 + (place === 'hermit' ? 1 : 0)) * 4);
}
export function episodeCollides(place: EpisodePlace, b: Aabb, profile?: ForestSurfaceProfile): boolean {
  if (b.x < 0 || b.x + b.width > 1024 || b.y < 0) return true;
  for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.width); x++) if (b.y + b.height > episodeGround(place, x, profile)) return true;
  return false;
}
interface EpisodePhysical {
  terrainProfile?: ForestSurfaceProfile;
  place: EpisodePlace; player: PlayerMotionState; tick: number;
  gate: boolean; mill: EpisodeWaterState; practice: EpisodeWaterState;
  wheelSpeed: number; stableTicks: number; wheelAngle: number; casts: number; baselineCollected: number;
}
export interface ForestEpisodeSave {
  schema: 'tokipona.forest-waterwheel-episode.v0.1';
  openingChecksum: string; session: GameSessionSave; physical: EpisodePhysical; checksum: string;
}
export interface EpisodeResult { accepted: boolean; text: string; speaker?: string; choice?: 'work' | 'predict' }

/** Owns ALL episode progression. UI supplies only input/target/choice, never position or completion claims. */
export class ForestEpisode {
  readonly terrainProfile?: ForestSurfaceProfile;
  private session: GameSession;
  private truth: GameSessionState;
  private physical: EpisodePhysical;
  private previousJump = false;
  private grace: PlayerJumpGrace = EMPTY_JUMP_GRACE;
  private constructor(session: GameSession, private readonly openingChecksum: string, physical?: EpisodePhysical) {
    this.session = session; this.truth = session.snapshot();
    this.terrainProfile = physical ? physical.terrainProfile : 'woodland-v2';
    if (this.terrainProfile !== undefined && this.terrainProfile !== 'woodland-v2') throw new Error('章节地形版本不兼容');
    this.physical = physical ?? { terrainProfile: 'woodland-v2', place: 'settlement', player: this.spawn('settlement', 120), tick: 0,
      gate: false, mill: emptyEpisodeWater(), practice: emptyEpisodeWater(), wheelSpeed: 0, stableTicks: 0, wheelAngle: 0, casts: 0, baselineCollected: 0 };
  }
  static begin(opening: PrologueForestOpeningSession): ForestEpisode {
    if (opening.snapshot().mode !== 'settlement_perimeter') throw new Error('请先穿过溪路，抵达聚落');
    if (opening.snapshot().session.mp.maxMp < 2) throw new Error('该存档的最大 MP 不足以进行初次练习；保留原档，需先处理能力配置');
    const save = opening.toSave();
    const result = new ForestEpisode(GameSession.fromSave(save.session), save.checksum);
    result.commit('enter', [{ type: 'scene_entered', eventId: 'episode.enter', payload: { sceneId: 'scene.valley.settlement' } }]);
    return result;
  }
  static restore(candidate: unknown): ForestEpisode {
    const s = candidate as ForestEpisodeSave;
    if (!s || s.schema !== EPISODE_SAVE_KEY || typeof s.openingChecksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(s.openingChecksum)) throw new Error('章节存档版本不兼容');
    const { checksum, ...body } = s;
    if (sha256Canonical(body as unknown as JsonValue) !== checksum) throw new Error('章节存档校验失败');
    const game = new ForestEpisode(GameSession.fromSave(s.session), s.openingChecksum, structuredClone(s.physical));
    game.validate();
    return game;
  }
  toSave(): ForestEpisodeSave {
    const body = { schema: EPISODE_SAVE_KEY as typeof EPISODE_SAVE_KEY, openingChecksum: this.openingChecksum, session: this.session.toSave(), physical: structuredClone(this.physical) };
    return { ...body, checksum: sha256Canonical(body as unknown as JsonValue) };
  }
  has(flag: EpisodeFlag): boolean { return this.truth.world.flags['global:' + FLAG + flag]?.value === true; }
  get state(): Readonly<EpisodePhysical> { return this.physical; }
  groundAt(x: number, place: EpisodePlace = this.physical.place): number { return episodeGround(place, x, this.terrainProfile); }
  get sessionState(): GameSessionState { return this.truth; }
  get player(): PlayerState { const p = this.physical.player; return { position: { x: p.x, y: p.y }, velocity: { x: p.velocityX, y: p.velocityY }, grounded: p.grounded, body: { width: 12, height: 14 } }; }
  controls(kind: 'mill' | 'practice'): EpisodeWaterControls {
    return { kind, gate: this.physical.gate, cleared: this.has('cleared'), plugged: this.has('plugged') };
  }
  get objective(): string {
    if (this.has('finished')) return '小节完成 · 可以自由回访，后续位点尚未开放';
    if (this.has('debrief')) return '回聚落找工务人报平安，领取报酬';
    if (this.has('practiced')) return '找隐士复盘这次练习，问下一步去哪里';
    if (this.has('predicted')) return this.physical.casts ? '用木楔补住漏口，再试一次；让清水抵达右端接水盆' : '在石槽旁 E 小量施放 telo（2 MP），观察水往哪里走';
    if (this.has('observed')) return '石槽旁 E：先预测，再尝试，不必猜词拼写';
    if (this.has('intro')) return '靠近石槽 E，观察自然水与刻字';
    if (this.has('route')) return '沿聚落西侧林间小径，带着媒介寻找隐士';
    if (this.has('medium')) return '带着受损媒介和森林碎片回聚落，请工务人辨认';
    if (this.has('repaired')) return '水轮稳定了；到工坊右侧检修石龛取出异物';
    if (this.has('job')) return !this.has('brace') ? '去东边工坊：从木料架取木撑，装在水轮支架上' : !this.has('cleared') ? '清掉水渠淤堵，再扳动闸柄引水' : '打开水闸，观察水流抵达水轮，确认稳定运转';
    return '在林间聚落找工务人，问能否用维修换一晚落脚';
  }
  nearest(): { id: EpisodeTarget; x: number; label: string } | null {
    const p = this.physical.player;
    return EPISODE_TARGETS[this.physical.place].filter(t => Math.abs(t.x - (p.x + 6)) <= 30 && Math.abs(p.y + 14 - this.groundAt(t.x)) <= 28)
      .sort((a, b) => Math.abs(a.x - p.x - 6) - Math.abs(b.x - p.x - 6))[0] ?? null;
  }
  advance(input: PlayerMotionInput = { moveX: 0, jump: false }): void {
    const p = this.physical;
    const motion = stepPlayerMotion({ state: p.player, body: { width: 12, height: 14 }, input: { moveX: Number.isFinite(input.moveX) ? Math.max(-1, Math.min(1, input.moveX)) : 0, jump: !!input.jump },
      previousJump: this.previousJump, jumpGrace: this.grace, fixedSeconds: 1 / 60, collides: b => episodeCollides(p.place, b, this.terrainProfile) });
    p.player = motion.state; this.previousJump = motion.previousJump; this.grace = motion.jumpGrace ?? EMPTY_JUMP_GRACE; p.tick++;
    // Channels freeze with the scene: no off-screen completion or forgotten input while reading dialogue.
    if (p.place === 'mill') {
      const flow = advanceEpisodeWater(p.mill, this.controls('mill'));
      p.wheelSpeed += ((flow > 0 ? 1 : 0) - p.wheelSpeed) * 0.025;
      p.wheelAngle = (p.wheelAngle + p.wheelSpeed * 0.04) % (Math.PI * 2);
      p.stableTicks = this.has('brace') && this.has('cleared') && p.wheelSpeed > 0.08 ? Math.min(180, p.stableTicks + 1) : 0;
      if (p.stableTicks >= 180 && !this.has('repaired')) this.mark('repaired');
    }
    if (p.place === 'hermit') {
      advanceEpisodeWater(p.practice, this.controls('practice'));
      if (!this.has('practiced') && this.has('predicted') && this.has('plugged') && p.casts > 0 && collectedEpisodeWater(p.practice) >= p.baselineCollected + 12) this.mark('practiced');
    }
  }
  interact(target: EpisodeTarget, choice?: string): EpisodeResult {
    if (this.nearest()?.id !== target) return { accepted: false, text: '再靠近一些，站稳后互动。' };
    const say = (text: string, speaker?: string): EpisodeResult => ({ accepted: true, text, ...(speaker ? { speaker } : {}) });
    const requireJob = () => !this.has('job');
    switch (target) {
      case 'worker': {
        if (this.has('finished')) return say('屋里给你留了床位。水轮运转正常，林中的路也随时向你敞开。', '工务人');
        if (this.has('debrief')) {
          const e = this.truth.economy;
          this.mark('finished', [{ eventId: 'episode.reward', type: 'economy_wallet_changed', payload: {
            expectedWalletRevision: e.walletRevision, nextWalletRevision: e.walletRevision + 1, coinDelta: 8, nextCoin: e.coin + 8 } },
            { eventId: 'episode.lodging', type: 'world_flag_set', payload: { flagId: 'forest.settlement.lodging_earned', value: true, scope: 'global' } },
            { eventId: 'episode.checkpoint', type: 'checkpoint_set', payload: { checkpoint: { id: 'forest.episode.lodging', sceneId: 'scene.valley.settlement', position: { x: 340, y: this.groundAt(340, 'settlement') - 14 }, revision: this.truth.checkpoint.revision + 1 } } }]);
          return say('水又进了磨房，明早大家就有面粉。约好的八枚钱，还有今晚的床位，都归你。地下蓄水廊的入口先别急着找——把隐士的话记好，等你准备好再启程。', '工务人');
        }
        if (this.has('medium')) {
          if (!this.has('route')) this.mark('route');
          return say('不是水轮上的零件。这枚碎片的槽口，与西边林中旧石碑很像。沿聚落西侧小径找那位隐士，他认得一些旧文字。带回来也好，不去也好，维修的功劳仍算你的。', '工务人');
        }
        if (this.has('job')) return say('工坊在东边。木料架有现成木撑；先扶稳轮轴，清淤，再引水。别用蛮力转轮子，让流水自己做工。', '工务人');
        if (choice === 'accept') { this.mark('job'); return say('那就拜托你了。东边旧工坊的轮轴松了，水渠也堵着。取木撑、扶轮轴、清淤、开闸；工具都在原处。修好回来，我付八枚钱，给你一个床位。', '工务人'); }
        return { accepted: true, speaker: '工务人', text: '从溪路来的？这里有床位，只是水轮坏了，大家正缺人手。你愿意替我们修一修吗？不用会魔法。', choice: 'work' };
      }
      case 'mill-road': this.travel('mill', 100); return say('旧水渠通向东边工坊。');
      case 'hermit-road':
        if (!this.has('route')) return say('西侧小径没留下清楚的路标。先问问工务人这里住着谁。');
        this.travel('hermit', 100); return say('越过低矮灌木，石槽旁有人正在整理工具。');
      case 'return': this.travel('settlement', this.physical.place === 'mill' ? 870 : 110); return say('回到聚落。');
      case 'timber':
        if (requireJob()) return say('这是聚落的备用木料。先和工务人商量维修。');
        if (!this.has('timber')) this.mark('timber');
        return say(this.has('brace') ? '木撑已经装好，不需要搬更多木料。' : '你拿起一根合适的木撑。把它送到右边水轮的支架处。');
      case 'brace':
        if (!this.has('timber')) return say('轮轴歪了。先去左侧木料架拿一根木撑。');
        if (!this.has('brace')) this.mark('brace');
        return say('木撑顶住了轮轴。现在即使有水冲击，它也不会再左右摆动。');
      case 'silt':
        if (requireJob()) return say('淤泥堵住了水渠。先接受工务人的维修委托。');
        if (!this.has('cleared')) this.mark('cleared');
        return say('你用渠边的铲子清出泥块。槽底重新露出来，水能沿坡流向右侧。');
      case 'gate':
        if (requireJob()) return say('这里的闸门关系着聚落用水。先问工务人。');
        this.physical.gate = !this.physical.gate;
        return say(this.physical.gate ? '闸门抬起。留意水是否穿过整段渠道，以及轮轴是否平稳。' : '闸门关闭。剩余水会继续流出，可安全检查支架和水渠。');
      case 'medium':
        if (!this.has('repaired')) return say('检修石龛卡在轮轴后的凸轮下。让水轮稳定运转，凸轮才会把盖板抬起。');
        if (!this.has('medium')) this.mark('medium', ['artifact.ancient_medium_frame', 'artifact.fragment.forest_site'].map(id => ({
          eventId: `episode.owns.${id}`, type: 'world_flag_set', payload: { flagId: `owns.${id}`, value: true, scope: 'global' } })));
        return say('石龛里是一件有裂纹的古代媒介，旁边嵌着一枚森林位点碎片。它们已收进你的行囊，不会因离开地图而丢失。你还不知道怎么使用，也没有因此学会任何词。');
      case 'hermit':
        if (this.has('practiced')) {
          if (!this.has('debrief')) this.mark('debrief');
          return say('你没有命令水停在空中，而是先看懂坡度，再用木楔补住漏口。telo 在这里指水，也可以指液体；它不是“水必须听我摆布”。媒介只是通路，你自己的 MP 和它的损伤都限制力量。碎片属于散落的位点，地下蓄水廊或许还有同类痕迹。先把修好的水轮交还给村里，之后的路由你选。', '隐士');
        }
        if (!this.has('intro')) this.mark('intro');
        return say('这是旧文明的施术媒介，裂口太深，只能承受很小的表达。旧人抽走维系秩序的能量，光暗与元素的规则便开始失衡；我只知道残留下来的这一部分。先去右边看水槽。我在水壶和槽边写下了它的读音：telo。别急着施法：先看自然水如何沿坡度流动。', '隐士');
      case 'pool': {
        if (!this.has('intro')) return say('石槽旁有陌生文字，先请隐士说明。');
        if (!this.has('observed')) {
          supplyEpisodeWater(this.physical.practice, 32, this.controls('practice')); this.mark('observed');
          return say('隐士舀来少量自然水：水落入石槽，往低处流；中段有一道漏口。水壶与槽边都标注着同一个读音 telo。先看一会儿，准备好再按 E。', '隐士');
        }
        if (!this.has('predicted')) {
          if (choice === 'downhill') { this.mark('predicted'); return say('对。表达只引来小量水，不会取消重力，也不会修好石槽。接下来按 E 试一次：2 MP、32 个水格；受损媒介只开放这一档。', '隐士'); }
          if (choice) return say('看看槽底的倾斜，还有中间的缺口。水会受重力影响，不会凭空悬停。再观察后试试，不扣 MP。', '隐士');
          return { accepted: true, speaker: '隐士', text: '如果在槽左侧引来一小团 telo，它会怎样？', choice: 'predict' };
        }
        if (this.has('practiced')) return say('接水盆里留住了清水。回去和隐士谈谈你观察到了什么。');
        if (this.physical.practice.cells.some((v, i) => v === 1 && i % 160 < 137)) return say('先等这次水流走完，或去右边用木楔堵住漏口；不要连续灌水。');
        if (this.truth.mp.currentMp < 2) return say('MP 不足。回隐士旁的坐垫休息，再来练习；不用重开，也不会丢掉碎片。');
        const n = this.physical.casts + 1, mp = this.truth.mp;
        this.commit(`cast.${n}`, [{ eventId: `episode.cast.${n}`, type: 'mp_replaced', payload: { mp: { ...mp, currentMp: mp.currentMp - 2, worldVersion: mp.worldVersion + 1 } } }], 'cast');
        this.physical.casts = n; this.physical.baselineCollected = collectedEpisodeWater(this.physical.practice);
        supplyEpisodeWater(this.physical.practice, 32, this.controls('practice'));
        return say('telo。掌中的媒介轻轻震动，少量水落入槽内。MP −2。水仍会流进漏口；观察结果，再用旁边的工具处理。');
      }
      case 'plug':
        if (!this.has('observed')) return say('槽边放着一枚木楔。先观察石槽里的水。');
        if (!this.has('plugged')) this.mark('plugged');
        return say('木楔嵌入漏口。你没有用魔法修好石槽，而是给水补出了一条完整的路。');
      case 'rest': {
        if (!this.has('intro')) return say('先和隐士打个招呼。');
        const mp = this.truth.mp;
        if (mp.currentMp >= mp.maxMp) return say('你在树下平复呼吸。MP 已满，最大 MP 没有变化。');
        this.commit(`rest.${this.truth.revision}`, [{ eventId: `episode.rest.${this.truth.revision}`, type: 'mp_replaced', payload: { mp: { ...mp, currentMp: Math.min(mp.maxMp, mp.currentMp + 4), worldVersion: mp.worldVersion + 1 } } }], 'mp_recovery');
        return say('你坐下调整呼吸，恢复了最多 4 MP。媒介的裂纹仍在，不能靠休息提高施法上限。');
      }
    }
  }
  private spawn(place: EpisodePlace, x: number): PlayerMotionState {
    return { x, y: Math.min(...Array.from({ length: 12 }, (_, i) => this.groundAt(x + i, place))) - 14, velocityX: 0, velocityY: 0, grounded: true };
  }
  private travel(place: EpisodePlace, x: number): void {
    this.commit(`travel.${this.truth.revision}`, [{ eventId: `episode.travel.${this.truth.revision}`, type: 'scene_entered', payload: { sceneId: place === 'mill' ? 'scene.valley.waterwheel' : place === 'hermit' ? 'scene.valley.stream_section' : 'scene.valley.settlement' } }]);
    this.physical.place = place; this.physical.player = this.spawn(place, x); this.previousJump = false; this.grace = EMPTY_JUMP_GRACE;
  }
  private mark(flag: EpisodeFlag, extra: SessionEventDraft[] = []): void {
    this.commit(flag, [{ eventId: `episode.flag.${flag}`, type: 'world_flag_set', payload: { flagId: FLAG + flag, value: true, scope: 'global' } }, ...extra],
      ['observed', 'predicted', 'practiced'].includes(flag) ? 'learning' : 'world');
  }
  private commit(id: string, drafts: SessionEventDraft[], domain: 'world' | 'cast' | 'mp_recovery' | 'learning' = 'world'): void {
    const result = commitSessionProposal(this.session, { transactionId: `episode.${id}`, drafts: [...drafts, {
      eventId: `episode.receipt.${id}`, type: 'receipt_recorded', payload: { receiptId: `forest.episode.${id}`, domain,
        payloadHash: sha256Canonical({ place: this.physical.place, tick: this.physical.tick, player: this.physical.player, drafts } as unknown as JsonValue) } }] });
    if (!result.committed) throw new Error(`章节事务未提交：${id}/${result.reason}`);
    this.session = result.session; this.truth = this.session.snapshot();
  }
  private validate(): void {
    const p = this.physical;
    if (!p || !Object.hasOwn(EPISODE_PLACES, p.place) || !p.player || typeof p.player.grounded !== 'boolean' || typeof p.gate !== 'boolean' ||
        ![p.tick, p.casts, p.stableTicks, p.baselineCollected].every(n => Number.isSafeInteger(n) && n >= 0) || p.stableTicks > 180 ||
        ![p.wheelSpeed, p.wheelAngle, p.player.x, p.player.y, p.player.velocityX, p.player.velocityY].every(Number.isFinite) ||
        p.wheelSpeed < 0 || p.wheelSpeed > 1 || p.wheelAngle < 0 || p.wheelAngle >= Math.PI * 2 ||
        Math.abs(p.player.velocityX) > 88.001 || Math.abs(p.player.velocityY) > 240.001 ||
        episodeCollides(p.place, { ...p.player, width: 12, height: 14 }, this.terrainProfile)) throw new Error('章节空间存档无效');
    validateEpisodeWater(p.mill); validateEpisodeWater(p.practice);
    const scene = p.place === 'mill' ? 'scene.valley.waterwheel' : p.place === 'hermit' ? 'scene.valley.stream_section' : 'scene.valley.settlement';
    const castReceipts = Object.values(this.truth.receiptIndex).filter(r => r.receiptId.startsWith('forest.episode.cast.'));
    if (this.truth.world.currentSceneId !== scene || !this.truth.receiptIndex['forest.episode.enter'] ||
        this.has('repaired') && p.mill.escaped < 1 ||
        castReceipts.length !== p.casts || castReceipts.some((_, i) => this.truth.receiptIndex[`forest.episode.cast.${i + 1}`]?.domain !== 'cast')) throw new Error('章节场景或施法凭证不一致');
    const deps: Partial<Record<EpisodeFlag, EpisodeFlag[]>> = { timber: ['job'], brace: ['timber'], cleared: ['job'], repaired: ['brace', 'cleared'], medium: ['repaired'], route: ['medium'], intro: ['route'], observed: ['intro'], predicted: ['observed'], plugged: ['observed'], practiced: ['predicted', 'plugged'], debrief: ['practiced'], finished: ['debrief'] };
    for (const flag of CHECKS) {
      if (this.has(flag) && (!(this.truth.receiptIndex[`forest.episode.${flag}`]) || deps[flag]?.some(dep => !this.has(dep)))) throw new Error('章节进度前后不一致');
    }
    if (p.place === 'hermit' && !this.has('route') || p.casts > 0 && !this.has('predicted') ||
        this.has('practiced') && (p.casts === 0 || collectedEpisodeWater(p.practice) < p.baselineCollected + 12) ||
        p.practice.supplied !== (this.has('observed') ? 32 : 0) + p.casts * 32 ||
        this.has('medium') !== (this.truth.world.flags['global:owns.artifact.ancient_medium_frame']?.value === true) ||
        this.has('medium') !== (this.truth.world.flags['global:owns.artifact.fragment.forest_site']?.value === true)) throw new Error('章节媒介或练习证据不一致');
  }
}
