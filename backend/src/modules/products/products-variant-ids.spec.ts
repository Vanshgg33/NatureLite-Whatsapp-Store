import { Types } from 'mongoose';
import { ProductsService } from './products.service';

// Editing a product must keep each variant's _id: IMS store stock is keyed by it.
describe('product update keeps variant ids', () => {
  it('by SKU, or by name when the SKU was renamed; new variants get new ids', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const id = new Types.ObjectId();
    const repo = {
      findById: jest.fn().mockResolvedValue({ variants: [{ _id: a, sku: 'S1', name: '250gm' }, { _id: b, sku: 'old', name: '500gm' }] }),
      findByIdAndUpdateDoc: jest.fn((_id: string, u: any) => Promise.resolve({ _id: id, variants: u.variants })),
    };
    const svc = new ProductsService(repo as any, {} as any, {} as any, { syncProductById: jest.fn().mockResolvedValue(undefined) } as any, {} as any, {} as any, {} as any);
    (svc as any).mirrorStockToMainStore = jest.fn();
    (svc as any).overlayStoreStock = jest.fn();
    (svc as any).clearChatbotCache = jest.fn();

    await svc.update(String(id), {
      variants: [
        { name: '250gm', sku: 'S1', price: 1 },
        { name: '500gm', sku: '2', price: 2 },
        { name: '1kg', sku: 'S3', price: 3 },
      ],
    } as any);

    const saved = repo.findByIdAndUpdateDoc.mock.calls[0][1].variants;
    expect(saved.map((v: any) => v._id)).toEqual([a, b, undefined]);
  });
});
