import { DEFAULT_FORMULAS, SLOT_KEYS, selfCheck } from './formula-engine';
import { NODE_GROUPS } from './formula-presets';

describe('Logics boxes and their choices', () => {
  it('every formula step belongs to exactly one box', () => {
    const all = NODE_GROUPS.flatMap(g => g.slots).sort();
    expect(all).toEqual([...SLOT_KEYS].sort());
  });
  it('the first choice of each box is the built-in behaviour', () => {
    for (const g of NODE_GROUPS) {
      for (const [slot, expr] of Object.entries(g.options[0].set)) expect([g.id, expr]).toEqual([g.id, (DEFAULT_FORMULAS as any)[slot]]);
    }
  });
  it('every choice only touches steps of its own box', () => {
    for (const g of NODE_GROUPS) for (const o of g.options) for (const slot of Object.keys(o.set)) expect([g.id, g.slots.includes(slot as any)]).toEqual([g.id, true]);
  });
  it('every choice passes the publish checks on its own', () => {
    for (const g of NODE_GROUPS) for (const o of g.options) expect([`${g.id}/${o.id}`, selfCheck({ ...DEFAULT_FORMULAS, ...o.set })]).toEqual([`${g.id}/${o.id}`, []]);
  });
  it('all choices together also pass', () => {
    const everything = Object.assign({}, DEFAULT_FORMULAS, ...NODE_GROUPS.map(g => g.options[g.options.length - 1].set));
    expect(selfCheck(everything)).toEqual([]);
  });
  it('choice ids are unique inside a box', () => {
    for (const g of NODE_GROUPS) expect(new Set(g.options.map(o => o.id)).size).toBe(g.options.length);
  });
});
