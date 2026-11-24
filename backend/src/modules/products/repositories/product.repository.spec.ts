import { Types } from 'mongoose';
import { ProductRepository } from './product.repository';

const oid = () => new Types.ObjectId();

/** A find() chain that records its filter and resolves to `rows`. */
const chain = (rows: any[], seen: any[]) => (filter: any) => {
  seen.push(filter);
  const c: any = { sort: () => c, limit: (n: number) => { seen.push({ limit: n }); return c; }, exec: async () => rows };
  return c;
};

function repo(model: any) {
  const r: any = Object.create(ProductRepository.prototype);
  r.model = model;
  return r as ProductRepository;
}

describe('ProductRepository.findByIdWithCategory', () => {
  const doc = (category: unknown) => {
    const d: any = { category, populate: jest.fn(async () => d) };
    return d;
  };

  it('does not populate an empty-string category (imported products), so the lookup no longer throws', async () => {
    const d = doc('');
    const r = repo({ findById: () => ({ exec: async () => d }) });
    await expect(r.findByIdWithCategory(oid())).resolves.toBe(d);
    expect(d.populate).not.toHaveBeenCalled();
  });

  it('populates a real category', async () => {
    const d = doc(oid());
    const r = repo({ findById: () => ({ exec: async () => d }) });
    await r.findByIdWithCategory(oid());
    expect(d.populate).toHaveBeenCalledWith('category', 'gstPercentage');
  });

  it('returns null for an unknown product', async () => {
    const r = repo({ findById: () => ({ exec: async () => null }) });
    await expect(r.findByIdWithCategory(oid())).resolves.toBeNull();
  });
});

describe('ProductRepository.searchByText', () => {
  it('tops up text matches with partial name / SKU matches instead of hiding them', async () => {
    const a = { _id: oid(), name: 'Cow Ghee' };
    const b = { _id: oid(), name: 'Bilona Ghee A2' };
    const seen: any[] = [];
    const finds = [chain([a], seen), chain([b], seen)];
    const r = repo({ find: (f: any) => finds.shift()!(f) });
    const out = await r.searchByText('ghee', 20);
    expect(out).toEqual([a, b]);
    const regexFilter = seen[2];
    expect(regexFilter._id.$nin).toEqual([a._id]); // no duplicates
    expect(regexFilter.$or).toHaveLength(3); // name, sku, variant sku
    expect(seen).toContainEqual({ limit: 19 }); // only the remaining room
  });

  it('skips the second query when text search already filled the limit', async () => {
    const rows = [{ _id: oid() }, { _id: oid() }];
    const find = jest.fn(chain(rows, []));
    const r = repo({ find });
    await expect(r.searchByText('x', 2)).resolves.toEqual(rows);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
