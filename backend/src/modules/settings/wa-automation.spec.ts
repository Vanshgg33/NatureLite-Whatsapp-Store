import { SettingsService } from './settings.service';

const svc = (saved: Record<string, unknown> | null) =>
  new SettingsService({ findOneByKey: async () => (saved ? { value: saved } : null) } as any);

describe('getWaAutomation', () => {
  it('falls back to defaults when nothing is saved', async () => {
    expect(await svc(null).getWaAutomation('fms_approved')).toEqual({ enabled: true, template: 'fms_approved' });
    expect(await svc(null).getWaAutomation('billing_invoice')).toEqual({ enabled: true, template: 'invoice_bill' });
  });

  it('uses saved values, trims names, and ignores blank or wrong-typed ones', async () => {
    const s = svc({
      fms_approved: { enabled: false, template: '  my_tpl ' },
      fms_rejected: { enabled: 'no', template: '   ' },
    });
    expect(await s.getWaAutomation('fms_approved')).toEqual({ enabled: false, template: 'my_tpl' });
    expect(await s.getWaAutomation('fms_rejected')).toEqual({ enabled: true, template: 'fms_rejected' });
  });

  it('unknown ids are off', async () => {
    expect((await svc(null).getWaAutomation('nope')).enabled).toBe(false);
  });
});
