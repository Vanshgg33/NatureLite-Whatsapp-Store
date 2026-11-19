import { PURCHASE_ORDER_MATCH, refundedAmount, withNetTotals } from './crm-purchases';

describe('online purchase definition', () => {
  it('counts delivered orders and orders refunded after delivery; never replacements', () => {
    expect(PURCHASE_ORDER_MATCH.orderType).toEqual({ $ne: 'replacement' });
    expect(PURCHASE_ORDER_MATCH.$or[0]).toEqual({ status: 'delivered' });
    expect(PURCHASE_ORDER_MATCH.$or[1]).toMatchObject({ status: 'refunded' });
    // a refund before delivery (cancelled prepaid order) is not a purchase
    expect(JSON.stringify(PURCHASE_ORDER_MATCH.$or[1])).toContain('deliveredAt');
  });
});

describe('refundedAmount', () => {
  it('partial refund: only the refunded part comes off', () => {
    expect(refundedAmount({ total: 1000 }, [{ amount: 1000, refundAmount: 100 }])).toBe(100);
  });
  it('full refund (gateway amount refunded, wallet part credited back): the whole order total', () => {
    expect(refundedAmount({ total: 1200 }, [{ amount: 1000, refundAmount: 1000 }])).toBe(1200);
    expect(refundedAmount({ total: 1200 }, [{ amount: 1000 }])).toBe(1200); // no amount recorded = full
  });
  it('never more than the order total, exact to the paisa, nothing refunded = 0', () => {
    expect(refundedAmount({ total: 50 }, [{ amount: 900, refundAmount: 80 }, { amount: 900, refundAmount: 0.1 }])).toBe(50);
    expect(refundedAmount({ total: 500 }, [{ amount: 500, refundAmount: 0.1 }, { amount: 500, refundAmount: 0.2 }])).toBe(0.3);
    expect(refundedAmount({ total: 500 }, [])).toBe(0);
  });
});

describe('withNetTotals', () => {
  const model = (pays: any[]) => {
    const q = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(pays) };
    return { find: jest.fn(() => q) } as any;
  };

  it('delivered orders keep their total and no payment lookup is made', async () => {
    const m = model([]);
    const out = await withNetTotals(m, [{ _id: 'o1', status: 'delivered', total: 700 }]);
    expect(out[0]).toMatchObject({ refundedAmount: 0, netTotal: 700 });
    expect(m.find).not.toHaveBeenCalled();
  });

  it('refunded orders are netted from their own refund payments only', async () => {
    const m = model([{ order: 'o1', amount: 1000, refundAmount: 250 }, { order: 'o2', amount: 400, refundAmount: 400 }]);
    const out = await withNetTotals(m, [
      { _id: 'o1', status: 'refunded', total: 1000 },
      { _id: 'o2', status: 'refunded', total: 400 },
      { _id: 'o3', status: 'refunded', total: 300 }, // no refund payment found: status says refunded, so fully
      { _id: 'o4', status: 'delivered', total: 90 },
    ]);
    expect(m.find.mock.calls[0][0]).toEqual({ order: { $in: ['o1', 'o2', 'o3'] }, status: 'refunded' });
    expect(out.map(o => [o.refundedAmount, o.netTotal])).toEqual([[250, 750], [400, 0], [300, 0], [0, 90]]);
  });
});
