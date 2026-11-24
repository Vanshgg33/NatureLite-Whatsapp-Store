import {
  andFilters,
  customerRank,
  customerSearchFilter,
  parseCustomerQuery,
  rankCustomers,
  searchCustomersRanked,
} from './customer-search';

const names = (xs: { name: string }[]) => xs.map((x) => x.name);
const c = (name: string, phone = '919000000000', email?: string) => ({ name, phone, email });

describe('parseCustomerQuery', () => {
  it('trims, collapses whitespace and ignores case', () => {
    expect(parseCustomerQuery('   Om   Prakash ')).toMatchObject({ text: 'Om Prakash', lower: 'om prakash', words: 'om prakash' });
  });
  it('returns null for empty / blank input', () => {
    expect(parseCustomerQuery('')).toBeNull();
    expect(parseCustomerQuery('   ')).toBeNull();
    expect(parseCustomerQuery(undefined)).toBeNull();
  });
  it('treats digits and phone punctuation as a phone query, and strips the country code from a full number', () => {
    expect(parseCustomerQuery('+91 98765-43210')).toMatchObject({ phoneLike: true, national: '9876543210' });
    expect(parseCustomerQuery('098765 43210')).toMatchObject({ phoneLike: true, national: '9876543210' });
    expect(parseCustomerQuery('98765')).toMatchObject({ phoneLike: true, national: '98765' });
    expect(parseCustomerQuery('+91 98765')).toMatchObject({ national: '98765' });
    expect(parseCustomerQuery('098765')).toMatchObject({ national: '98765' });
  });
  it('a bare +91 or 0 is not a phone search (it would match everyone)', () => {
    expect(parseCustomerQuery('+91')?.phoneLike).toBe(false);
    expect(parseCustomerQuery('0')?.phoneLike).toBe(false);
  });
  it('does not treat text that merely contains digits as a phone query', () => {
    expect(parseCustomerQuery('Store 2')).toMatchObject({ phoneLike: false });
    expect(parseCustomerQuery('om')).toMatchObject({ phoneLike: false, digits: '' });
  });
});

describe('rankCustomers: names', () => {
  // the rows from the CRM screenshot, in the order the old priority sort showed them
  const rows = [
    c('priyasinghboss1@gmail.com'),
    c("Nature's pride trading company"),
    c('shyamlalnayak03@gmail.com'),
    c('Komal Jamuar'),
    c('Loma Choudhary'),
    c('Tomesh'),
    c('Improvise,adapt,overcome'),
    c('Romy Vohra'),
    c('Om Prakash'),
    c('Omkar Joshi'),
    c('Shri Om Traders'),
    c('Priya Sharma'),
  ];

  it('puts names starting with "om" first, then word starts, then plain substrings; drops non-matches', () => {
    const out = names(rankCustomers(rows, 'om', (r) => r));
    expect(out.slice(0, 3)).toEqual(['Om Prakash', 'Omkar Joshi', 'Shri Om Traders']);
    expect(out).not.toContain('Priya Sharma'); // no "om" anywhere
    // substring-only matches follow, in their incoming (priority) order
    expect(out.slice(3)).toEqual([
      'priyasinghboss1@gmail.com',
      "Nature's pride trading company",
      'shyamlalnayak03@gmail.com',
      'Komal Jamuar',
      'Loma Choudhary',
      'Tomesh',
      'Improvise,adapt,overcome',
      'Romy Vohra',
    ]);
  });

  it('ranks exact, then starts-with, then word-start, then contains', () => {
    const list = [c('Gomti Om'), c('Bhoomi'), c('Omkar'), c('Om')];
    expect(names(rankCustomers(list, 'om', (r) => r))).toEqual(['Om', 'Omkar', 'Gomti Om', 'Bhoomi']);
  });

  it('is case-insensitive and ignores surrounding or repeated whitespace', () => {
    const list = [c('Komal'), c('OM PRAKASH')];
    expect(names(rankCustomers(list, '  oM  pra ', (r) => r))).toEqual(['OM PRAKASH']);
  });

  it('handles multi-word queries at a word boundary', () => {
    const list = [c('Shri Om Prakash Traders'), c('Prakash Om')];
    expect(names(rankCustomers(list, 'om pr', (r) => r))).toEqual(['Shri Om Prakash Traders']);
  });

  it('keeps incoming order for equal ranks (so priority / name order survives)', () => {
    const list = [c('Omar B'), c('Omar A'), c('Omar C')];
    expect(names(rankCustomers(list, 'om', (r) => r))).toEqual(['Omar B', 'Omar A', 'Omar C']);
  });

  it('returns nothing for a query that matches no one', () => {
    expect(rankCustomers(rows, 'zzz', (r) => r)).toEqual([]);
  });

  it('returns the list untouched when there is no query', () => {
    expect(rankCustomers(rows, '  ', (r) => r)).toBe(rows);
  });

  it('can match email when asked to', () => {
    const list = [{ name: '', phone: '', email: 'om@x.in' }, { name: 'Komal', phone: '', email: '' }];
    expect(rankCustomers(list, 'om@', (r) => r, ['name', 'email'])).toHaveLength(1);
  });
});

describe('rankCustomers: phones', () => {
  const rows = [
    c('A', '919123987650'), // contains 98765 (inside the number)
    c('B', '919876543210'), // starts with 98765
    c('C', '919876500000'), // starts with 98765
    c('D', '919876543210'), // same number as B
  ];

  it('numbers starting with the digits come before numbers that only contain them', () => {
    expect(names(rankCustomers(rows, '98765', (r) => r))).toEqual(['B', 'C', 'D', 'A']);
  });

  it('finds the same customer for 98765 43210, +91 98765-43210 and 098765 43210, and ranks the exact number first', () => {
    const list = [c('Near', '919876543219'), c('Exact', '919876543210')];
    for (const q of ['98765 43210', '+91 98765-43210', '098765 43210', '9876543210', '919876543210']) {
      expect(names(rankCustomers(list, q, (r) => r))[0]).toBe('Exact');
    }
  });

  it('a partial number with the country code ranks prefix matches first', () => {
    expect(names(rankCustomers(rows, '+91 98765', (r) => r))).toEqual(['B', 'C', 'D', 'A']);
  });

  it('does not match phones for a name query, even one that contains digits', () => {
    expect(rankCustomers([c('Zed', '919876543210')], 'Store 2', (r) => r)).toEqual([]);
    expect(customerRank(parseCustomerQuery('om')!, { name: 'Zed', phone: '919999999999' })).toBe(Infinity);
  });

  it('no match for digits that are nowhere in the number', () => {
    expect(rankCustomers(rows, '55555', (r) => r)).toEqual([]);
  });
});

describe('customerSearchFilter', () => {
  it('escapes regex characters and is anchored for exact / prefix tiers', () => {
    const q = parseCustomerQuery('a.b (c)');
    const prefix = customerSearchFilter(q, 'prefix')!;
    expect(prefix.$or[0]).toEqual({ name: { $regex: '^a\\.b\\s+\\(c\\)', $options: 'i' } });
    expect(customerSearchFilter(q, 'exact')!.$or[0]).toEqual({ name: { $regex: '^a\\.b\\s+\\(c\\)$', $options: 'i' } });
  });

  it('adds a phone clause only for phone-like queries, anchored for prefix so the phone index can serve it', () => {
    expect(customerSearchFilter(parseCustomerQuery('om'), 'any')!.$or).toHaveLength(1);
    const f = customerSearchFilter(parseCustomerQuery('+91 98765'), 'prefix')!;
    expect(f.$or).toContainEqual({ phone: { $regex: '^(91)?98765' } }); // +91 is dropped: stored numbers are 91XXXXXXXXXX
    expect(customerSearchFilter(parseCustomerQuery('98765'), 'any')!.$or).toContainEqual({ phone: { $regex: '98765' } });
  });

  it('is null without a query', () => {
    expect(customerSearchFilter(null)).toBeNull();
  });

  it('the generated patterns really match what they promise', () => {
    const rx = (f: any) => new RegExp(f.$or[0].name.$regex, 'i');
    const q = parseCustomerQuery('om')!;
    expect(rx(customerSearchFilter(q, 'prefix')).test('Omkar')).toBe(true);
    expect(rx(customerSearchFilter(q, 'prefix')).test('Komal')).toBe(false);
    expect(rx(customerSearchFilter(q, 'word')).test('Shri Om Traders')).toBe(true);
    expect(rx(customerSearchFilter(q, 'word')).test('Komal')).toBe(false);
    expect(rx(customerSearchFilter(q, 'exact')).test('om')).toBe(true);
    expect(rx(customerSearchFilter(q, 'exact')).test('omkar')).toBe(false);
  });
});

describe('andFilters', () => {
  it('keeps both $or conditions instead of one overwriting the other', () => {
    const a = { $or: [{ x: 1 }] };
    const b = { $or: [{ y: 2 }] };
    expect(andFilters(a, b)).toEqual({ $and: [a, b] });
    expect(andFilters(null, undefined, {})).toEqual({});
    expect(andFilters(a)).toBe(a);
  });
});

describe('searchCustomersRanked', () => {
  /** A fake collection: applies each regex clause to name/phone like Mongo would, honouring $nin, sort and limit. */
  function fakeModel(docs: any[]) {
    const calls: any[] = [];
    const matches = (d: any, f: any): boolean => {
      if (f.$and) return f.$and.every((p: any) => matches(d, p));
      if (f.$or) return f.$or.some((p: any) => matches(d, p));
      return Object.entries(f).every(([k, v]: [string, any]) => {
        if (k === '_id') return !v.$nin.includes(d._id);
        if (k === 'tag') return d.tag === v;
        return new RegExp(v.$regex, v.$options).test(d[k] ?? '');
      });
    };
    return {
      calls,
      find(f: any) {
        calls.push(f);
        let rows = docs.filter((d) => matches(d, f));
        const chain: any = {
          sort: () => { rows = [...rows].sort((a, b) => a.name.localeCompare(b.name)); return chain; },
          limit: (n: number) => { rows = rows.slice(0, n); return chain; },
          lean: async () => rows,
        };
        return chain;
      },
    };
  }

  const docs = [
    { _id: 1, name: 'Komal', phone: '919000000001' },
    { _id: 2, name: 'Omkar', phone: '919000000002' },
    { _id: 3, name: 'Om', phone: '919000000003' },
    { _id: 4, name: 'Shri Om', phone: '919000000004' },
    { _id: 5, name: 'Tomesh', phone: '919000000005' },
    { _id: 6, name: 'Priya', phone: '919000000006' },
  ];

  it('returns the best matches first and excludes non-matches', async () => {
    const out = await searchCustomersRanked(fakeModel(docs), 'om', { limit: 20 });
    expect(names(out)).toEqual(['Om', 'Omkar', 'Shri Om', 'Komal', 'Tomesh']);
  });

  it('does not let a small limit crowd out the best matches with substring hits', async () => {
    const out = await searchCustomersRanked(fakeModel(docs), 'om', { limit: 2 });
    expect(names(out)).toEqual(['Om', 'Omkar']);
  });

  it('stops querying once the limit is filled by better tiers', async () => {
    const m = fakeModel(docs);
    await searchCustomersRanked(m, 'om', { limit: 2 });
    expect(m.calls).toHaveLength(2); // exact + prefix; no word / contains query
  });

  it('keeps the caller filters (permissions, "missing name" lists) on every query', async () => {
    const m = fakeModel([{ _id: 1, name: 'Om A', phone: '1', tag: 'x' }, { _id: 2, name: 'Om B', phone: '2', tag: 'y' }]);
    const out = await searchCustomersRanked(m, 'om', { limit: 20, extra: { tag: 'x' } });
    expect(names(out)).toEqual(['Om A']);
  });

  it('finds by a phone prefix, formatted or not', async () => {
    const m = fakeModel([{ _id: 1, name: 'Z', phone: '919876543210' }, { _id: 2, name: 'Y', phone: '919123987650' }]);
    expect(names(await searchCustomersRanked(m, '98765', { limit: 20 }))).toEqual(['Z', 'Y']); // prefix first, then contains
    expect(names(await searchCustomersRanked(m, '+91 98765', { limit: 20 }))).toEqual(['Z', 'Y']);
    expect(names(await searchCustomersRanked(m, '098765', { limit: 20 }))).toEqual(['Z', 'Y']);
    expect(names(await searchCustomersRanked(m, '98765 43210', { limit: 20 }))).toEqual(['Z']);
  });

  it('returns nothing for a blank query', async () => {
    expect(await searchCustomersRanked(fakeModel(docs), '   ', { limit: 20 })).toEqual([]);
  });
});
