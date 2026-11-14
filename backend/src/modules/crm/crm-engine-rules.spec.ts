import { CrmEngineService } from './crm-engine.service';
import { DEFAULT_CRM_FORMULAS, DEFAULT_CRM_RULES } from './engine/crm-formulas';

const lean = (v: unknown) => ({ lean: jest.fn().mockResolvedValue(v) });
function make(settings: any, set: any) {
  const settingsModel: any = { findOne: jest.fn(() => lean(settings)) };
  const setModel: any = { findOne: jest.fn(() => ({ sort: jest.fn(() => lean(set)) })) };
  return new CrmEngineService({} as any, settingsModel, {} as any, {} as any, {} as any, {} as any, setModel);
}

describe('CrmEngineService.loadRules', () => {
  it('gives the built-in rules when nothing is stored', async () => {
    expect(await make(null, null).loadRules()).toEqual(DEFAULT_CRM_RULES);
  });
  it('uses the newest published formulas over the built-ins', async () => {
    const r = await make(null, { version: 2, formulas: { priorityScore: 'daysLate' } }).loadRules();
    expect(r.formulas).toEqual({ ...DEFAULT_CRM_FORMULAS, priorityScore: 'daysLate' });
  });
  it('uses stored values and falls back per value for old documents', async () => {
    const r = await make({ dueSoonDays: 3, priorityHighAt: 70 }, null).loadRules();
    expect(r).toMatchObject({ dueSoonDays: 3, minOrdersForPersonal: 3, priorityHighAt: 70, priorityMediumAt: 35 });
  });
});
