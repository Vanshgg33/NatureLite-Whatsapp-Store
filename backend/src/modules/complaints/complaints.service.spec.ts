import { BadRequestException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';

const doc = (over: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'c1' }, status: 'new', orderId: null, customerId: { toString: () => 'cust1' }, ticketNo: 'CMP-2026-0001',
  events: [] as unknown[], firstRespondedAt: null, resolvedAt: null,
  save: jest.fn().mockResolvedValue(undefined), toObject() { return { ...this }; }, ...over,
});

function build(found: ReturnType<typeof doc> | null, claim: unknown = 'claimed') {
  // findById is awaited directly (mustFind) and also used with .lean() (final read in resolve)
  const findById = jest.fn(() => Object.assign(Promise.resolve(found), { lean: () => Promise.resolve({ status: 'resolved' }) }));
  const model = {
    findById,
    findOneAndUpdate: jest.fn().mockResolvedValue(claim === 'claimed' ? { status: found?.status, resolvedAt: null, firstRespondedAt: null } : claim),
    updateOne: jest.fn().mockResolvedValue({}),
  } as any;
  const orders = { createReplacementOrder: jest.fn().mockResolvedValue({ _id: { toString: () => 'o2' }, orderNumber: 'ORD2' }) };
  const wallet = { credit: jest.fn().mockResolvedValue({}) };
  const wa = { sendTextMessage: jest.fn().mockResolvedValue('wamid') };
  const user = { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ phone: '9100000000' }) }) }) };
  const svc = new ComplaintsService(model, {} as any, user as any, {} as any, orders as any, wallet as any, wa as any);
  return { svc, model, orders, wallet, wa };
}

const oid = '64b000000000000000000001';

describe('ComplaintsService.resolve', () => {
  it('requires a reason', async () => {
    const { svc } = build(doc());
    await expect(svc.resolve(oid, { type: 'apology', reason: '  ' }, 'A', 'u')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replacement needs a linked order and creates nothing without one', async () => {
    const { svc, orders } = build(doc());
    await expect(svc.resolve(oid, { type: 'replacement', reason: 'leaked' }, 'A', 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.createReplacementOrder).not.toHaveBeenCalled();
  });

  it('replacement creates the order, records it on the ticket and notifies the customer', async () => {
    const { svc, orders, model, wa } = build(doc({ orderId: { toString: () => 'o1' } }));
    const res = await svc.resolve(oid, { type: 'replacement', reason: 'leaked' }, 'A', 'u');
    expect(orders.createReplacementOrder).toHaveBeenCalledWith('o1', 'CMP-2026-0001', 'A', undefined);
    const update = model.updateOne.mock.calls.at(-1)[1];
    expect(update.$set.resolution).toMatchObject({ type: 'replacement', replacementOrderNumber: 'ORD2' });
    expect(wa.sendTextMessage).toHaveBeenCalled();
    expect(res.customerNotified).toBe(true);
  });

  it('wallet credit converts rupees to paise and rejects bad amounts before touching anything', async () => {
    const { svc, wallet, model } = build(doc());
    await expect(svc.resolve(oid, { type: 'wallet_credit', reason: 'x', amount: 0 }, 'A', 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    await svc.resolve(oid, { type: 'wallet_credit', reason: 'x', amount: 150 }, 'A', 'u');
    expect(wallet.credit).toHaveBeenCalledWith('cust1', 15000, 'complaint CMP-2026-0001', expect.anything());
  });

  it('refuses an already resolved ticket', async () => {
    const { svc } = build(doc({ status: 'resolved' }));
    await expect(svc.resolve(oid, { type: 'apology', reason: 'x' }, 'A', 'u')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a second concurrent resolve loses the atomic claim and gives the customer nothing twice', async () => {
    const { svc, wallet } = build(doc(), null); // someone else already flipped the status
    await expect(svc.resolve(oid, { type: 'wallet_credit', reason: 'x', amount: 50 }, 'A', 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it('puts the ticket back to open if the replacement order fails, so it can be retried', async () => {
    const { svc, orders, model } = build(doc({ orderId: { toString: () => 'o1' } }));
    orders.createReplacementOrder.mockRejectedValue(new Error('out of stock'));
    await expect(svc.resolve(oid, { type: 'replacement', reason: 'x' }, 'A', 'u')).rejects.toThrow('out of stock');
    expect(model.updateOne).toHaveBeenCalledWith({ _id: expect.anything() }, { $set: { status: 'new', resolvedAt: null } });
  });

  it('reports when the customer could not be messaged', async () => {
    const { svc, wa } = build(doc());
    wa.sendTextMessage.mockRejectedValue(new Error('outside 24h window'));
    const res = await svc.resolve(oid, { type: 'apology', reason: 'x' }, 'A', 'u');
    expect(res.customerNotified).toBe(false);
  });
});

describe('ComplaintsService.setStatus', () => {
  it('cannot resolve or close an open ticket by hand', async () => {
    const { svc } = build(doc({ status: 'investigating' }));
    await expect(svc.setStatus(oid, 'resolved', 'A')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setStatus(oid, 'closed', 'A')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reopening clears resolvedAt and gives a fresh deadline', async () => {
    const d = doc({ status: 'resolved', resolvedAt: new Date(), resolutionDueAt: new Date(0) });
    const { svc } = build(d);
    await svc.setStatus(oid, 'reopened', 'A');
    expect(d.status).toBe('reopened');
    expect((d as any).resolvedAt).toBeNull();
    expect((d as any).resolutionDueAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('ComplaintsService.reply', () => {
  it('internal notes are not sent to the customer and do not count as a first response', async () => {
    const d = doc();
    const { svc, wa } = build(d);
    await svc.reply(oid, 'check packing log', 'A', true);
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
    expect(d.firstRespondedAt).toBeNull();
  });

  it('a public reply stamps the first response, moves new to investigating and flags a failed send', async () => {
    const d = doc();
    const { svc, wa } = build(d);
    wa.sendTextMessage.mockResolvedValue(null);
    const res = await svc.reply(oid, 'we are checking', 'A', false);
    expect(d.firstRespondedAt).toBeInstanceOf(Date);
    expect(d.status).toBe('investigating');
    expect(res.customerNotified).toBe(false);
  });

  it('refuses to reply on a closed ticket', async () => {
    const { svc } = build(doc({ status: 'closed' }));
    await expect(svc.reply(oid, 'hi', 'A', false)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ComplaintsService.list', () => {
  it('treats the search text as plain text, not a regex', async () => {
    const find = jest.fn(() => ({ select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }));
    const model = {
      find: jest.fn(() => ({ sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }) }) })),
      countDocuments: jest.fn().mockResolvedValue(0),
    } as any;
    const svc = new ComplaintsService(model, {} as any, { find } as any, {} as any, {} as any, {} as any, {} as any);
    await expect(svc.list({ search: '(((' })).resolves.toMatchObject({ total: 0 });
  });
});
