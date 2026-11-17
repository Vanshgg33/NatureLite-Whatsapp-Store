import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { cleanVendorInput } from './lib/vendor-input';

describe('cleanVendorInput', () => {
  it('trims, collapses spaces and normalises case-sensitive fields', () => {
    const out = cleanVendorInput({
      name: '  Om   Herbal ', phone: '98765 43210', email: ' A@B.COM ', gstin: '27aapfu0939f1zv', pincode: ' 452001 ',
    });
    expect(out).toMatchObject({ name: 'Om Herbal', phone: '9876543210', email: 'a@b.com', gstin: '27AAPFU0939F1ZV', pincode: '452001', city: '' });
  });

  it.each([
    [{ name: '   ' }],
    [{ name: 'X', phone: '12345' }],
    [{ name: 'X', email: 'nope' }],
    [{ name: 'X', gstin: 'ABC' }],
    [{ name: 'X', pincode: '012345' }],
  ])('rejects invalid input %j', (input) => {
    expect(() => cleanVendorInput(input as any)).toThrow(BadRequestException);
  });

  it('accepts +91 prefixed mobile', () => {
    expect(cleanVendorInput({ name: 'X', phone: '+91 98765-43210' }).phone).toBe('+919876543210');
  });
});

describe('PurchaseService.createVendor', () => {
  const make = (existing: any) => {
    const vendorModel = {
      findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(existing) }),
      create: jest.fn(async (d: any) => ({ _id: 'new-id', ...d })),
    };
    const svc = new (PurchaseService as any)({}, {}, vendorModel, {}, {}, {}, {}, {}) as PurchaseService;
    return { svc, vendorModel };
  };

  it('creates the vendor with cleaned fields and returns its id', async () => {
    const { svc, vendorModel } = make(null);
    const v: any = await svc.createVendor({ name: ' Jeera  Traders ', city: 'Indore' });
    expect(v._id).toBe('new-id');
    expect(vendorModel.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jeera Traders', city: 'Indore' }));
    const q = vendorModel.findOne.mock.calls[0][0].$or[0].name;
    expect(new RegExp(q.$regex, q.$options).test('jeera traders')).toBe(true);
    expect(new RegExp(q.$regex, q.$options).test('Jeera Traders Pvt')).toBe(false);
  });

  it('checks GSTIN too when provided', async () => {
    const { svc, vendorModel } = make(null);
    await svc.createVendor({ name: 'A', gstin: '27AAPFU0939F1ZV' });
    expect(vendorModel.findOne.mock.calls[0][0].$or[1]).toEqual({ gstin: '27AAPFU0939F1ZV' });
  });

  it('refuses a duplicate instead of creating or overwriting', async () => {
    const { svc, vendorModel } = make({ name: 'Om Herbal', gstin: '', isActive: true });
    await expect(svc.createVendor({ name: 'om herbal' })).rejects.toThrow(ConflictException);
    expect(vendorModel.create).not.toHaveBeenCalled();
  });

  it('tells the user when the duplicate is inactive', async () => {
    const { svc } = make({ name: 'Om Herbal', gstin: '', isActive: false });
    await expect(svc.createVendor({ name: 'Om Herbal' })).rejects.toThrow(/inactive/);
  });
});
