import { Types } from 'mongoose';
import { CrmService } from './crm.service';
import { UserRepository } from '../users/repositories/user.repository';

const oid = () => new Types.ObjectId();

// The Customers screen from the bug report, in the priority order it used to show them.
const SCREEN = [
  'priyasinghboss1@gmail.com',
  "Nature's pride trading company",
  'shyamlalnayak03@gmail.com',
  'Komal Jamuar',
  'Loma Choudhary',
  'Tomesh',
  'Improvise,adapt,overcome',
  'Romy Vohra',
  'Om Prakash',
  'Omkar Joshi',
  'Priya Sharma',
].map((name, i) => ({ _id: oid(), name, phone: `91900000${String(1000 + i)}`, priorityScore: 100 - i }));

function crm(users = SCREEN) {
  const seen: any[] = [];
  const svc: any = Object.create(CrmService.prototype);
  svc.openComplaintUserIds = async () => [];
  svc.userModel = { find: (f: any) => { seen.push(f); return { select: () => ({ lean: async () => users }) }; } };
  svc.statsModel = {
    find: () => ({
      sort: () => ({ lean: async () => users.map((u) => ({ userId: u._id, priorityScore: u.priorityScore })) }),
      lean: async () => users.map((u) => ({ userId: u._id, priorityScore: u.priorityScore })),
    }),
  };
  return { svc: svc as CrmService, seen };
}
const shown = (r: any) => r.data.map((d: any) => d.user.name);

describe('CRM customer list search', () => {
  it('"om": names starting with om come first, unrelated customers do not outrank them, non-matches are gone', async () => {
    const { svc } = crm();
    const r = await svc.getCustomers({ search: 'om' });
    expect(shown(r).slice(0, 2)).toEqual(['Om Prakash', 'Omkar Joshi']);
    expect(shown(r)).not.toContain('Priya Sharma');
    expect(r.total).toBe(shown(r).length);
  });

  it('keeps the priority order among equally good matches', async () => {
    const { svc } = crm();
    const r = await svc.getCustomers({ search: 'om' });
    // Komal (priority 97) before Tomesh (95) before Romy (93): all plain substring matches
    expect(shown(r).filter((n: string) => ['Komal Jamuar', 'Tomesh', 'Romy Vohra'].includes(n))).toEqual(['Komal Jamuar', 'Tomesh', 'Romy Vohra']);
  });

  it('without a search the list is still in priority order', async () => {
    const { svc } = crm();
    expect(shown(await svc.getCustomers({}))[0]).toBe('priyasinghboss1@gmail.com');
  });

  it('an empty or blank search does not filter', async () => {
    const { svc, seen } = crm();
    const r = await svc.getCustomers({ search: '   ' });
    expect(r.total).toBe(SCREEN.length);
    expect(seen[0]).toEqual({});
  });

  it('a search with no matches returns an empty page', async () => {
    const { svc } = crm([]);
    expect(await svc.getCustomers({ search: 'zzz' })).toMatchObject({ data: [], total: 0 });
  });

  it('sends the database an escaped, case-insensitive filter, and keeps the "missing name" filter beside it', async () => {
    const { svc, seen } = crm();
    await svc.getCustomers({ search: 'a(b', missing: 'missing_name' });
    expect(seen[0].$and).toHaveLength(2);
    expect(JSON.stringify(seen[0])).toContain('a\\\\(b');
    expect(seen[0].$and[0].$nor ?? seen[0].$and[0].name).toBeDefined(); // the incomplete-lead filter survived
  });

  it('phone: a number prefix ranks above numbers that only contain the digits', async () => {
    const users = [
      { _id: oid(), name: 'A', phone: '919123987650', priorityScore: 9 },
      { _id: oid(), name: 'B', phone: '919876543210', priorityScore: 1 },
    ];
    const { svc } = crm(users);
    expect(shown(await svc.getCustomers({ search: '98765' }))).toEqual(['B', 'A']);
    expect(shown(await svc.getCustomers({ search: '+91 98765-43' }))).toEqual(['B']);
  });

  it('assigned-agent view ranks too, and cannot see customers outside the agent\'s own stats', async () => {
    const mine = SCREEN.slice(3, 10); // the agent's customers
    const { svc } = crm(mine);
    const r = await svc.getCustomers({ search: 'om', agentId: oid().toString() });
    expect(shown(r).slice(0, 2)).toEqual(['Om Prakash', 'Komal Jamuar'].slice(0, 1).concat(shown(r)[1]));
    expect(shown(r).every((n: string) => mine.some((u) => u.name === n))).toBe(true);
  });
});

describe('Admin customers list (UserRepository.findAllPaginated)', () => {
  function repo(rows: any[]) {
    const r: any = Object.create(UserRepository.prototype);
    const finds: any[] = [];
    r.model = {
      find: (f: any) => {
        finds.push(f);
        const c: any = {
          sort: () => c, select: () => c, skip: () => c, limit: () => c,
          lean: () => c,
          exec: async () => (f._id ? rows.filter((x) => f._id.$in.some((id: any) => String(id) === String(x._id))) : rows),
        };
        return c;
      },
      countDocuments: async () => rows.length,
    };
    return { repo: r as UserRepository, finds };
  }
  const rows = [
    { _id: oid(), name: 'Komal', phone: '919000000001', email: '' },
    { _id: oid(), name: 'Omkar', phone: '919000000002', email: '' },
    { _id: oid(), name: 'Om', phone: '919000000003', email: '' },
    { _id: oid(), name: 'Zed', phone: '919000000004', email: 'zed@om.in' },
  ];

  it('ranks the matches, pages the ranked list, and reports the matching total', async () => {
    const { repo: r } = repo(rows);
    const p1: any = await r.findAllPaginated({ search: 'om', page: 1, limit: 2 } as any);
    expect(p1.items.map((u: any) => u.name)).toEqual(['Om', 'Omkar']);
    expect(p1.total).toBe(4);
    expect(p1.hasNext).toBe(true);
    const p2: any = await r.findAllPaginated({ search: 'om', page: 2, limit: 2 } as any);
    expect(p2.items.map((u: any) => u.name)).toEqual(['Zed', 'Komal']); // Zed matches by email at a word start (om.in), ahead of Komal's plain substring
  });

  it('a regex character in the box is searched literally instead of failing', async () => {
    const { repo: r, finds } = repo(rows);
    await expect(r.findAllPaginated({ search: '(', page: 1, limit: 10 } as any)).resolves.toBeDefined();
    expect(JSON.stringify(finds[0])).toContain('\\\\(');
  });
});
