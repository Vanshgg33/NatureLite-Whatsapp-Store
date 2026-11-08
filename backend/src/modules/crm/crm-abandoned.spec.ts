import { Types } from 'mongoose';
import { CrmService } from './crm.service';

const oid = () => new Types.ObjectId();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
const q = (rows: any[]) => {
  const c: any = { sort: () => c, limit: () => c, select: () => c, lean: async () => rows };
  return c;
};

function build(d: { sessions?: any[]; unpaid?: any[]; settled?: any[]; carts?: any[]; users?: any[]; stats?: any[] }) {
  const svc: any = Object.create(CrmService.prototype);
  svc.chatSessionModel = { find: () => q(d.sessions ?? []) };
  // 1st orderModel.find = unpaid, 2nd = settled (call order in getAbandoned)
  const orderCalls = [d.unpaid ?? [], d.settled ?? []];
  svc.orderModel = { find: () => q(orderCalls.shift()!) };
  svc.cartModel = { find: () => q(d.carts ?? []) };
  svc.userModel = { find: () => q(d.users ?? []) };
  svc.statsModel = { find: () => q(d.stats ?? []) };
  return svc as CrmService;
}

const items = [{ name: 'Honey', quantity: 2 }];

describe('CrmService.getAbandoned', () => {
  it('lists a stuck cart session with items', async () => {
    const u = oid();
    const svc = build({
      sessions: [{ user: u, phone: '91', currentState: 'address_input', lastMessageAt: minsAgo(60) }],
      carts: [{ user: u, total: 500, items }],
    });
    const r = await svc.getAbandoned();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ userId: u.toString(), step: 'address_input', total: 500 });
  });

  it('skips a session whose user ordered after leaving', async () => {
    const u = oid();
    const svc = build({
      sessions: [{ user: u, phone: '91', currentState: 'cart', lastMessageAt: minsAgo(60) }],
      carts: [{ user: u, total: 500, items }],
      settled: [{ user: u, createdAt: minsAgo(10) }],
    });
    expect(await svc.getAbandoned()).toHaveLength(0);
  });

  it('lists an unpaid pay-link order even with no session or cart', async () => {
    const u = oid();
    const svc = build({ unpaid: [{ user: u, createdAt: minsAgo(90), total: 700, items }] });
    const r = await svc.getAbandoned();
    expect(r[0]).toMatchObject({ userId: u.toString(), step: 'payment_pending', total: 700 });
  });

  it('drops an unpaid order that was paid/replaced by a later settled order', async () => {
    const u = oid();
    const svc = build({
      unpaid: [{ user: u, createdAt: minsAgo(90), total: 700, items }],
      settled: [{ user: u, createdAt: minsAgo(30) }],
    });
    expect(await svc.getAbandoned()).toHaveLength(0);
  });

  it('getChat returns oldest-first messages with readable text', async () => {
    const u = oid();
    const svc: any = build({});
    svc.userModel = { findById: () => q({ phone: '91' } as any) };
    svc.chatSessionModel = { findOne: () => q({ phone: '91', currentState: 'checkout', lastMessageAt: minsAgo(5) } as any) };
    svc.statsModel = { exists: async () => null };
    // find() returns newest-first (as the real sort does)
    svc.messageLogModel = {
      find: () => q([
        { _id: 2, direction: 'outbound', createdAt: minsAgo(1), messageType: 'interactive', content: { text: 'Pay now?' } },
        { _id: 1, direction: 'inbound', createdAt: minsAgo(2), messageType: 'image', content: {} },
      ]),
    };
    const r = await svc.getChat(u.toString());
    expect(r.step).toBe('checkout');
    expect(r.messages.map((m: any) => m.text)).toEqual(['[image]', 'Pay now?']);
    // an agent not assigned to this customer is refused
    await expect(svc.getChat(u.toString(), oid().toString())).rejects.toThrow('Customer not found');
    await expect(svc.getChat('bad-id')).rejects.toThrow('Invalid customer id');
  });

  it('agents only see their assigned customers', async () => {
    const mine = oid();
    const other = oid();
    const svc = build({
      unpaid: [
        { user: mine, createdAt: minsAgo(90), total: 1, items },
        { user: other, createdAt: minsAgo(80), total: 2, items },
      ],
      stats: [{ userId: mine }],
    });
    const r = await svc.getAbandoned({ agentId: oid().toString() });
    expect(r.map((x: any) => x.userId)).toEqual([mine.toString()]);
  });
});
