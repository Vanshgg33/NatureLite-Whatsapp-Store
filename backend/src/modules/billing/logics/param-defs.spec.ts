import { PARAM_DEFS, checkParamValue, paramDef, parseIntList } from './param-defs';

const def = (k: string) => paramDef(k)!;

describe('param validation', () => {
  it('accepts whole numbers and rejects negatives, decimals and blanks', () => {
    expect(checkParamValue(def('b2clThreshold'), '5000000')).toEqual({ value: 5_000_000 });
    expect(checkParamValue(def('gstr2bTolerancePaise'), 0)).toEqual({ value: 0 });
    for (const bad of ['-1', '1.5', '', 'abc', null]) expect('error' in checkParamValue(def('b2clThreshold'), bad)).toBe(true);
  });
  it('normalises retry delay lists and rejects bad ones', () => {
    expect(checkParamValue(def('whatsappRetryDelaysSec'), ' 30, 120 ,600')).toEqual({ value: '30,120,600' });
    for (const bad of ['', '0,5', '1,x', '1,2,3,4,5,6,7,8,9']) expect('error' in checkParamValue(def('whatsappRetryDelaysSec'), bad)).toBe(true);
  });
  it('parseIntList falls back on junk', () => {
    expect(parseIntList('60,300', [1])).toEqual([60, 300]);
    expect(parseIntList('nope', [1])).toEqual([1]);
  });
  it('every default passes its own validation', () => {
    for (const d of PARAM_DEFS) expect('error' in checkParamValue(d, d.default)).toBe(false);
  });
});
