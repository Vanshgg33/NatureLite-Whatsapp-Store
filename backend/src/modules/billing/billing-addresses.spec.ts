import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';

// Customer billing addresses: several per customer, edited one at a time, never silently overwritten.
function make(user: any, writeResult: 'ok' | 'lost' = 'ok') {
  const userModel = {
    findById: jest.fn(() => ({ lean: () => Promise.resolve(user) })),
    findOneAndUpdate: jest.fn((_f: any, u: any) => ({ lean: () => Promise.resolve(writeResult === 'ok' && user ? { ...user, billingAddresses: u.$set.billingAddresses } : null) })),
  };
  const svc = new (BillingService as any)(userModel) as BillingService;
  const written = () => (userModel.findOneAndUpdate.mock.calls[0] as any[]);
  return { svc, userModel, written };
}
const home = { label: 'Home', line: '12 MG Road, Raipur', isDefault: true };
const shop = { label: 'Shop', line: '4 Station Rd, Raipur', isDefault: false };

describe('Customer addresses', () => {
  it('adding keeps the existing ones and only moves the default when asked', async () => {
    const { svc, written } = make({ _id: 'c1', billingAddresses: [home] });
    const r: any = await svc.addAddress('c1', { label: 'Shop', line: '  4 Station   Rd, Raipur ' });
    expect(r.addresses).toEqual([home, { label: 'Shop', line: '4 Station Rd, Raipur', isDefault: false }]);
    expect(written()[0]).toEqual({ _id: 'c1', billingAddresses: [home] }); // only if unchanged since read
  });

  it('adding as default makes exactly one default', async () => {
    const r: any = await make({ _id: 'c1', billingAddresses: [home] }).svc.addAddress('c1', { ...shop, isDefault: true });
    expect(r.addresses.map((a: any) => a.isDefault)).toEqual([false, true]);
  });

  it('the first billing address keeps the delivery addresses the picker showed', async () => {
    const { svc, written } = make({ _id: 'c1', addresses: [{ label: 'Home', house: '12', area: 'MG Road', city: 'Raipur', isDefault: true }] });
    const r: any = await svc.addAddress('c1', shop);
    expect(r.addresses.map((a: any) => a.line)).toEqual(['12, MG Road, Raipur', shop.line]);
    expect(written()[0].$or).toBeDefined();
  });

  it('the same address twice is stored once', async () => {
    const r: any = await make({ _id: 'c1', billingAddresses: [home] }).svc.addAddress('c1', { label: 'x', line: '12 mg road, raipur' });
    expect(r.addresses).toHaveLength(1);
  });

  it('an empty address is refused', async () => {
    await expect(make({ _id: 'c1', billingAddresses: [] }).svc.addAddress('c1', { label: 'x', line: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('editing changes only that address', async () => {
    const r: any = await make({ _id: 'c1', billingAddresses: [home, shop] }).svc.updateAddress('c1', 1, { label: 'Shop', line: '5 Station Rd, Raipur', was: shop.line });
    expect(r.addresses).toEqual([home, { label: 'Shop', line: '5 Station Rd, Raipur', isDefault: false }]);
  });

  it('editing an address that changed meanwhile is refused, not overwritten', async () => {
    const { svc, userModel } = make({ _id: 'c1', billingAddresses: [home, shop] });
    await expect(svc.updateAddress('c1', 1, { line: 'x', was: 'what the cashier saw before' })).rejects.toThrow(ConflictException);
    await expect(svc.updateAddress('c1', 5, { line: 'x', was: shop.line })).rejects.toThrow(ConflictException);
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('editing into a copy of another saved address is refused', async () => {
    await expect(make({ _id: 'c1', billingAddresses: [home, shop] }).svc.updateAddress('c1', 1, { line: home.line, was: shop.line })).rejects.toThrow('already has that address');
  });

  it('a concurrent change between read and write is a conflict', async () => {
    await expect(make({ _id: 'c1', billingAddresses: [home] }, 'lost').svc.addAddress('c1', shop)).rejects.toThrow(ConflictException);
  });
});
