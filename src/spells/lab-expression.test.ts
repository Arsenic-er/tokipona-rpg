import { describe, expect, it } from 'vitest';
import { LAB_PRESETS, parseLabExpression } from './lab-expression';
describe('bounded experimental expression grammar', () => {
  it('accepts every offered example; preserves fixed-section length costs', () => {
    for (const [expression] of LAB_PRESETS) expect(parseLabExpression(expression).ok, expression).toBe(true);
    const a = parseLabExpression('telo'), b = parseLabExpression(' telo   suli '), c = parseLabExpression('telo lili');
    expect(a.ok && a.plan).toMatchObject({ cost: 5, width: 12, length: 32 });
    expect(b.ok && b.plan).toMatchObject({ cost: 10, width: 12, length: 64 });
    expect(c.ok && c.plan).toMatchObject({ cost: 6, width: 12, length: 16 });
    expect(parseLabExpression('telo o tawa wawa')).toMatchObject({ ok: true, plan: { cost: 18, forceful: true } });
  });
  it('does not silently reduce unsupported/duplicated expressions to single spells', () => {
    for (const expression of ['', 'telo telo', 'lete suli', 'wawa', 'seli o tawa', 'telo o tawa wawa wawa', '<script>', 'telo pakala', 'telo suli lili']) expect(parseLabExpression(expression).ok, expression).toBe(false);
  });
});
