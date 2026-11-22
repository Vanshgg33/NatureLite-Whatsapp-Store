import { incompleteLeadFilter, parseIncompleteLead } from './incomplete-lead.util';

// Minimal evaluator for the exact operators the filter uses (regex match, $not, $nor, array paths),
// so the Mongo semantics are checked against real-looking documents without a database.
const values = (doc: any, path: string): unknown[] => {
  const [head, ...rest] = path.split('.');
  const v = doc?.[head];
  if (!rest.length) return Array.isArray(v) ? v : [v];
  return (Array.isArray(v) ? v : [v]).flatMap((x) => values(x, rest.join('.')));
};
const hit = (doc: any, path: string, re: RegExp) => values(doc, path).some((v) => typeof v === 'string' && re.test(v));
const matches = (doc: any, f: any): boolean => Object.entries(f).every(([k, cond]: [string, any]) => {
  if (k === '$nor') return !cond.some((c: any) => matches(doc, c));
  if (cond instanceof RegExp) return hit(doc, k, cond);
  if (cond?.$not) return !hit(doc, k, cond.$not);
  throw new Error(`unsupported ${k}`);
});

const leads = [
  { id: 'named+addr', phone: '919800000001', name: 'Sharma', addresses: [{ city: 'Raipur' }] },
  { id: 'noName', phone: '919800000002', addresses: [{ city: 'Bhilai' }] },
  { id: 'blankName', phone: '919800000003', name: '   ', billingAddresses: [{ line: 'Shop 4, Durg' }] },
  { id: 'noAddr', phone: '919800000004', name: 'Verma', addresses: [], billingAddresses: [] },
  { id: 'blankAddr', phone: '919800000005', name: 'Gupta', addresses: [{ house: ' ', city: '' }], billingAddresses: [{ line: '\t' }] },
  { id: 'missingBoth', phone: '919800000006', name: '' },
  { id: 'noPhone', phone: '', name: '' },
  { id: 'nullPhone', phone: null, name: null },
];
const run = (kind: 'missing_name' | 'missing_address') => leads.filter((l) => matches(l, incompleteLeadFilter(kind))).map((l) => l.id);

describe('incompleteLeadFilter', () => {
  it('missing name: no / null / whitespace name, phone required', () => {
    expect(run('missing_name')).toEqual(['noName', 'blankName', 'missingBoth']);
  });
  it('missing address: no billing line and no delivery address part with text', () => {
    expect(run('missing_address')).toEqual(['noAddr', 'blankAddr', 'missingBoth']);
  });
  it('only accepts the two kinds', () => {
    expect(parseIncompleteLead('missing_name')).toBe('missing_name');
    expect(parseIncompleteLead('x')).toBeUndefined();
    expect(parseIncompleteLead(undefined)).toBeUndefined();
  });
});
