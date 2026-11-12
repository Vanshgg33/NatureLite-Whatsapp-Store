import { normalisePhone, groupDuplicatePhones } from './crm-foundation.service';

describe('crm foundation helpers', () => {
  it('normalises Indian phone formats to 10 digits', () => {
    for (const p of ['9876543210', '+91 98765-43210', '919876543210', '09876543210']) expect(normalisePhone(p)).toBe('9876543210');
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });

  it('groups only real duplicates', () => {
    const g = groupDuplicatePhones([
      { phone: '9876543210' }, { phone: '+919876543210' }, { phone: '9000000001' }, { phone: '' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].phone).toBe('9876543210');
    expect(g[0].users).toHaveLength(2);
  });
});
