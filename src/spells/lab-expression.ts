/** Bounded, explicitly experimental grammar. Never grants campaign knowledge/permissions. */
export type LabElement = 'telo' | 'seli' | 'lete' | 'kiwen' | 'ko' | 'kon';
export interface LabExpression {
  readonly text: string;
  readonly element: LabElement;
  readonly modifier: 'suli' | 'lili' | null;
  readonly length: number;
  readonly width: number;
  readonly cost: number;
  readonly motion: boolean;
  readonly forceful: boolean;
  readonly property: 'kon' | 'lete' | 'seli' | null;
  readonly description: string;
  readonly experimental: boolean;
}
export type LabParseResult = { ok: true; plan: LabExpression } | { ok: false; reason: string };
const PROFILES = {
  telo: { width: 12, base: 5, extension: 2 }, seli: { width: 8, base: 4, extension: 2 },
  lete: { width: 16, base: 4, extension: 0 }, kiwen: { width: 16, base: 8, extension: 2 },
  ko: { width: 16, base: 6, extension: 1.5 }, kon: { width: 24, base: 3, extension: 1.5 },
} as const;
const DESCRIPTIONS: Record<LabElement, string> = {
  telo: '显化少量水；释放后受重力影响', seli: '持续输入热量；可点燃木料或使水蒸发',
  lete: '持续移走热量；可冷却材料或使水冻结', kiwen: '显化固定硬质构形；不替换已有实体，整块坠落暂未接入',
  ko: '显化松散沙土；下落、堆积', kon: '短时空气扰动；抬升附近水和沙，结束后恢复下落',
};
export const LAB_PRESETS = [
  ['telo', '显化水'], ['telo suli', '长水柱'], ['telo lili', '短水柱'],
  ['seli', '加热木料'], ['lete', '冷却水槽'], ['kiwen', '硬质构形'], ['ko', '沙土堆积'], ['kon', '空气扰动'],
  ['telo lete', '冷水与冻结'], ['telo seli', '热水与蒸汽'], ['telo kon', '水与空气扰动'],
  ['ko kon', '沙土与空气扰动'], ['seli suli', '长热源'], ['kiwen suli', '长硬质构形'],
  ['telo o tawa', '低速水流'], ['telo kon o tawa', '凝聚水团试验'], ['telo o tawa wawa', '有力水流 / 冲击'],
] as const;
export const LAB_WORDS = ['telo', 'seli', 'lete', 'kiwen', 'ko', 'kon', 'suli', 'lili', 'o', 'tawa', 'wawa'] as const;
export function parseLabExpression(source: string): LabParseResult {
  const text = source.trim().toLowerCase().replace(/\s+/g, ' '), words = text.split(' ');
  const fail = (reason: string): LabParseResult => ({ ok: false, reason });
  if (!text || text.length > 80 || words.length > 4) return fail('请输入 1–4 个词；此实验室尚不支持更长的表达。');
  if (words.some(w => !(LAB_WORDS as readonly string[]).includes(w))) return fail('包含尚未接入实验室的词。这不表示该词在道本语中不合法。');
  if (!Object.hasOwn(PROFILES, words[0]!)) return fail('当前实验需要以一个已接入的材料／能量词开头。');
  const element = words[0] as LabElement, profile = PROFILES[element];
  let modifier: LabExpression['modifier'] = null, property: LabExpression['property'] = null, motion = false, forceful = false;
  if (words.length === 2 && element !== 'lete' && ['suli', 'lili'].includes(words[1]!)) modifier = words[1] as 'suli' | 'lili';
  else if (words.length === 2 && element === 'telo' && ['kon', 'lete', 'seli'].includes(words[1]!)) property = words[1] as LabExpression['property'];
  else if (text === 'ko kon') property = 'kon';
  else if (text === 'telo o tawa') motion = true;
  else if (text === 'telo kon o tawa') { motion = true; property = 'kon'; }
  else if (text === 'telo o tawa wawa') { motion = true; forceful = true; }
  else if (words.length !== 1) return fail('这个组合还没有实验实现，未扣 MP。可先从下方示例修改；不是语言对错判定。');
  const length = modifier === 'suli' ? 64 : modifier === 'lili' ? 16 : 32;
  const cost = forceful ? 18 : profile.base + (modifier ? 1 : 0) + (modifier === 'suli' ? profile.extension * 2 : 0) + (property ? 3 : 0) + (motion ? 2 : 0);
  let description = DESCRIPTIONS[element];
  if (modifier) description += `；只改变轴向长度为 ${length} px，截面 ${profile.width} px 不变，不增加单位强度`;
  if (property === 'kon') description += motion ? '；水团沿瞄准方向飞行，碰撞或到时后释放为水' : '；3 秒空气扰动结束后，仍按材料性质下落';
  if (property === 'lete') description += '；冷却过程通过材料相变形成冰，不是立即替换贴图';
  if (property === 'seli') description += '；持续加热可形成蒸汽，冷却后可凝结';
  if (motion) description = forceful ? '从施法点发出有力水流；撞击削弱可破坏土岩与木料，不能破坏锁定结构。18 MP；实验冲击标定，不计主线攻击资格。' : property === 'kon' ? description : '从施法点发出低速水流，碰撞后散开；没有冲击破坏力。';
  return { ok: true, plan: Object.freeze({ text, element, modifier, property, motion, forceful, length, width: profile.width, cost, description, experimental: property !== null || motion }) };
}
