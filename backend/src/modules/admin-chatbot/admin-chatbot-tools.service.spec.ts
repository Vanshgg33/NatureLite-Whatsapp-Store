import { AdminChatbotToolsService } from './admin-chatbot-tools.service';

// Chainable stand-in for a mongoose query: every builder returns itself, lean()/exec() resolve.
function query(result: unknown) {
  const q: any = {};
  for (const m of ['sort', 'limit', 'skip', 'populate', 'select']) q[m] = jest.fn(() => q);
  q.lean = jest.fn(() => Promise.resolve(result));
  q.exec = jest.fn(() => Promise.resolve(result));
  return q;
}

function fakeModel(over: Record<string, unknown> = {}) {
  return {
    find: jest.fn(() => query([])),
    findOne: jest.fn(() => query(null)),
    aggregate: jest.fn(() => ({ exec: () => Promise.resolve([]) })),
    countDocuments: jest.fn(() => Promise.resolve(0)),
    ...over,
  } as any;
}

// The real constructor takes ~35 injected collaborators; the new tools only touch the models below.
function makeService(over: Record<string, unknown> = {}): any {
  const svc: any = Object.create(AdminChatbotToolsService.prototype);
  Object.assign(
    svc,
    {
      redisService: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined) },
      billingBillModel: fakeModel(),
      billingCustomerModel: fakeModel(),
      godownModel: fakeModel(),
      crmStatsModel: fakeModel(),
      crmCallLogModel: fakeModel(),
      crmCampaignModel: fakeModel(),
      purchaseRequestModel: fakeModel(),
      purchaseVendorModel: fakeModel(),
      purchaseMaterialModel: fakeModel(),
      userModel: fakeModel(),
      userRepository: { getModel: jest.fn() },
    },
    over,
  );
  svc.userRepository.getModel.mockImplementation(() => svc.userModel);
  return svc;
}

describe('AdminChatbotToolsService.execute', () => {
  it('returns an error object for an unknown tool instead of throwing', async () => {
    const svc = makeService();
    await expect(svc.execute('does_not_exist', {})).resolves.toEqual({ error: 'Unknown tool: does_not_exist' });
  });

  it('caches new tools in redis under admin:tool:<name> with the configured TTL', async () => {
    const svc = makeService();
    await svc.execute('get_billing_godowns', {});
    expect(svc.redisService.getJson).toHaveBeenCalledWith('admin:tool:get_billing_godowns');
    expect(svc.redisService.setJson).toHaveBeenCalledWith('admin:tool:get_billing_godowns', { count: 0, godowns: [] }, 300);
  });

  it('serves a cache hit without querying the database', async () => {
    const svc = makeService();
    svc.redisService.getJson.mockResolvedValue({ count: 9, godowns: [] });
    await expect(svc.execute('get_billing_godowns', {})).resolves.toEqual({ count: 9, godowns: [] });
    expect(svc.godownModel.find).not.toHaveBeenCalled();
    expect(svc.redisService.setJson).not.toHaveBeenCalled();
  });

  it('does not cache an error result, so a fixed argument or new record is seen immediately', async () => {
    const svc = makeService();
    await expect(svc.execute('get_purchase_request_detail', { reqNo: 'PR-1' })).resolves.toMatchObject({ error: expect.any(String) });
    expect(svc.redisService.setJson).not.toHaveBeenCalled();
  });

  it('does not cache a "not found" message result', async () => {
    const svc = makeService();
    await expect(svc.execute('get_crm_call_logs', { customerName: 'Nobody' })).resolves.toMatchObject({ message: expect.any(String) });
    expect(svc.redisService.setJson).not.toHaveBeenCalled();
  });
});

describe('tool result cache keys', () => {
  const keysFor = async (...argSets: Array<Record<string, unknown>>) => {
    const svc = makeService();
    for (const args of argSets) await svc.execute('get_crm_customer_detail', args);
    return svc.redisService.getJson.mock.calls.map((c: any[]) => c[0] as string);
  };

  it.each([
    [{ customerName: 'Rahul' }, { customerName: 'Rohan' }],
    [{ customerName: 'Rahul Sharma' }, { customerName: 'Rajesh Kumar' }],
    [{ stage: 'AWAITING_APPROVAL' }, { stage: 'AWAITING_DELIVERY' }],
  ])('does not share a cache entry between %j and %j', async (a, b) => {
    const [ka, kb] = await keysFor(a, b);
    expect(ka).not.toBe(kb);
  });

  it('reuses the same cache entry for identical arguments', async () => {
    const [k1, k2] = await keysFor({ customerName: 'Rahul' }, { customerName: 'Rahul' });
    expect(k1).toBe(k2);
  });

  it('keeps the key readable and bounded: admin:tool:<name>:<short digest>', async () => {
    const [key] = await keysFor({ customerName: 'x'.repeat(5000) });
    expect(key).toMatch(/^admin:tool:get_crm_customer_detail:[A-Za-z0-9_-]{16,32}$/);
  });
});

describe('billing tools', () => {
  it('get_billing_bills escapes the customer name and excludes cancelled bills', async () => {
    const svc = makeService();
    await svc.execute('get_billing_bills', { customerName: 'Ra.hul', paymentStatus: 'unpaid' });
    const filter = svc.billingBillModel.find.mock.calls[0][0];
    expect(filter.customerName).toEqual({ $regex: 'Ra\\.hul', $options: 'i' });
    expect(filter.paymentStatus).toBe('unpaid');
    expect(filter.status).toEqual({ $ne: 'cancelled' });
  });

  it('get_billing_bills reports outstanding across ALL matching bills, not just the listed page', async () => {
    const svc = makeService({
      billingBillModel: fakeModel({
        find: jest.fn(() =>
          query([
            { invoiceNo: 'INV-2', customerName: 'A', grandTotal: 1000, amountPaid: 400, amountDue: 600, paymentStatus: 'partial', items: [{}, {}] },
          ]),
        ),
        aggregate: jest.fn(() => ({ exec: () => Promise.resolve([{ _id: null, total: 125000.4, count: 57 }]) })),
      }),
    });
    const res: any = await svc.execute('get_billing_bills', { limit: 1 });
    expect(res.totalOutstanding).toBe(125000);
    expect(res.totalMatching).toBe(57);
    expect(res.bills).toHaveLength(1);
    expect(res.bills[0]).toMatchObject({ invoiceNo: 'INV-2', outstanding: 600, itemCount: 2 });
  });

  it('get_billing_bills reports zero outstanding when nothing matches', async () => {
    const svc = makeService();
    const res: any = await svc.execute('get_billing_bills', {});
    expect(res.totalOutstanding).toBe(0);
    expect(res.bills).toEqual([]);
  });

  it('get_billing_bills clamps an oversized limit to 25, the most rows the model is shown', async () => {
    const svc = makeService();
    const q = query([]);
    svc.billingBillModel.find.mockReturnValue(q);
    await svc.execute('get_billing_bills', { limit: 500 });
    expect(q.limit).toHaveBeenCalledWith(25);
  });

  it('get_billing_bills ignores unparseable dates instead of sending an Invalid Date to Mongo', async () => {
    const svc = makeService();
    await svc.execute('get_billing_bills', { from: 'not-a-date', to: 'also-bad' });
    expect(svc.billingBillModel.find.mock.calls[0][0].createdAt).toBeUndefined();
  });

  it('get_billing_bills reads bare dates as whole IST days (00:00 to 23:59:59.999 IST)', async () => {
    const svc = makeService();
    await svc.execute('get_billing_bills', { from: '2026-01-01', to: '2026-01-31' });
    const { $gte, $lte } = svc.billingBillModel.find.mock.calls[0][0].createdAt;
    expect($gte.toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect($lte.toISOString()).toBe('2026-01-31T18:29:59.999Z');
  });

  it('get_billing_bills leaves full ISO timestamps exactly as given', async () => {
    const svc = makeService();
    await svc.execute('get_billing_bills', { from: '2026-01-01T10:00:00Z', to: '2026-01-02T10:00:00Z' });
    const { $gte, $lte } = svc.billingBillModel.find.mock.calls[0][0].createdAt;
    expect($gte.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect($lte.toISOString()).toBe('2026-01-02T10:00:00.000Z');
  });

  it('get_billing_customers reads billing customers and filters on outstanding and tag', async () => {
    const svc = makeService({
      billingCustomerModel: fakeModel({
        find: jest.fn(() =>
          query([{ name: 'Sharma Traders', phone: '9876543210', gstNo: '22AAAAA0000A1Z5', tags: ['B2B'], outstanding: 5000, orderCount: 4, totalPurchase: 90000 }]),
        ),
      }),
    });
    const res: any = await svc.execute('get_billing_customers', { hasOutstanding: true, tag: 'B2B' });
    const filter = svc.billingCustomerModel.find.mock.calls[0][0];
    expect(filter.outstanding).toEqual({ $gt: 0 });
    expect(filter.tags).toBe('B2B');
    expect(res.customers[0]).toEqual({
      name: 'Sharma Traders', phone: '9876543210', gstNo: '22AAAAA0000A1Z5', tags: ['B2B'],
      outstanding: 5000, totalOrders: 4, totalPurchase: 90000,
    });
  });

  it('get_billing_godowns lists name, code, address and default flag', async () => {
    const svc = makeService({
      godownModel: fakeModel({ find: jest.fn(() => query([{ name: 'Main', code: 'G1', address: 'Raipur', isDefault: true }])) }),
    });
    const res: any = await svc.execute('get_billing_godowns', {});
    expect(res).toEqual({ count: 1, godowns: [{ name: 'Main', code: 'G1', address: 'Raipur', isDefault: true }] });
  });
});

describe('CRM tools', () => {
  it('get_crm_overview works with empty args and merges legacy-cased segment names', async () => {
    const svc = makeService({
      crmStatsModel: fakeModel({
        aggregate: jest.fn(() => ({
          exec: () => Promise.resolve([
            { _id: 'overdue', count: 3 },
            { _id: 'Overdue', count: 2 },
            { _id: 'At Risk', count: 4 },
            { _id: 'at_risk', count: 1 },
          ]),
        })),
        countDocuments: jest.fn((f?: any) => Promise.resolve(f?.isVip ? 7 : 40)),
      }),
    });
    const res: any = await svc.execute('get_crm_overview', {});
    expect(res.totalTracked).toBe(40);
    expect(res.vipCount).toBe(7);
    expect(res.segments).toEqual(expect.arrayContaining([
      { segment: 'overdue', count: 5 },
      { segment: 'at_risk', count: 5 },
    ]));
  });

  it('get_crm_customer_detail requires a name or phone', async () => {
    const res: any = await makeService().execute('get_crm_customer_detail', {});
    expect(res.error).toMatch(/customerName or phone required/);
  });

  it('get_crm_customer_detail reports an unknown customer', async () => {
    const res: any = await makeService().execute('get_crm_customer_detail', { customerName: 'Nobody' });
    expect(res.error).toMatch(/not found/);
  });

  it('get_crm_customer_detail says there is no CRM data when the customer has no stats row', async () => {
    const svc = makeService();
    svc.userModel.findOne.mockReturnValue(query({ _id: 'u1', name: 'Rahul', phone: '919999999999' }));
    const res: any = await svc.execute('get_crm_customer_detail', { customerName: 'Rahul' });
    expect(res).toMatchObject({ name: 'Rahul', message: 'No CRM data yet' });
  });

  it('get_crm_customer_detail returns segment, LTV and an IST reorder date', async () => {
    const svc = makeService();
    svc.userModel.findOne.mockReturnValue(query({ _id: 'u1', name: 'Rahul', phone: '919999999999' }));
    svc.crmStatsModel.findOne.mockReturnValue(
      query({ segment: 'overdue', isVip: true, daysLate: 6, predictedReorderDate: new Date('2026-01-15T00:00:00Z'), ltv: 42000, aov: 1400, priorityScore: 88, topProduct: 'Ghee' }),
    );
    const res: any = await svc.execute('get_crm_customer_detail', { customerName: 'Rahul' });
    expect(res).toMatchObject({ segment: 'overdue', isVip: true, daysLate: 6, ltv: 42000, aov: 1400, predictedReorderDate: '15 Jan 2026' });
    expect(svc.crmStatsModel.findOne).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('get_crm_customer_detail matches a phone number by digits only', async () => {
    const svc = makeService();
    await svc.execute('get_crm_customer_detail', { phone: '+91 98765-43210' });
    expect(svc.userModel.findOne.mock.calls[0][0]).toEqual({ phone: { $regex: '919876543210' } });
  });

  it('get_crm_call_logs filters by the resolved customer id and outcome', async () => {
    const svc = makeService();
    svc.userModel.findOne.mockReturnValue(query({ _id: 'u1' }));
    svc.crmCallLogModel.find.mockReturnValue(
      query([{ customerId: { name: 'Rahul', phone: '919999999999' }, agentId: { name: 'Priya' }, type: 'call', outcome: 'callback', notes: 'call back Monday', callbackAt: null, createdAt: new Date('2026-01-15T00:00:00Z') }]),
    );
    const res: any = await svc.execute('get_crm_call_logs', { customerName: 'Rahul', outcome: 'callback' });
    expect(svc.crmCallLogModel.find.mock.calls[0][0]).toMatchObject({ customerId: 'u1', outcome: 'callback' });
    expect(res.logs[0]).toMatchObject({ customer: 'Rahul', phone: '9999999999', agent: 'Priya', outcome: 'callback' });
  });

  it('get_crm_call_logs returns an empty list with a message for an unknown customer', async () => {
    const res: any = await makeService().execute('get_crm_call_logs', { customerName: 'Nobody' });
    expect(res.logs).toEqual([]);
    expect(res.message).toMatch(/not found/);
  });

  it('get_crm_campaigns filters by status and names the creator', async () => {
    const svc = makeService();
    svc.crmCampaignModel.find.mockReturnValue(
      query([{ name: 'Diwali', status: 'sent', segmentFilter: ['dormant'], recipientCount: 120, sentCount: 118, createdBy: { name: 'Priya' }, approvedBy: null, sentAt: null, createdAt: new Date('2026-01-15T00:00:00Z') }]),
    );
    const res: any = await svc.execute('get_crm_campaigns', { status: 'sent' });
    expect(svc.crmCampaignModel.find.mock.calls[0][0]).toEqual({ status: 'sent' });
    expect(res.campaigns[0]).toMatchObject({ name: 'Diwali', recipientCount: 120, sentCount: 118, createdBy: 'Priya', approvedBy: '' });
  });
});

describe('purchase tools', () => {
  const pr = {
    reqNo: 'PR-0007', status: 'REQUESTED', stage: 'NEEDS_PO', department: 'FLOUR_MILL', priority: 'URGENT',
    pendingLineCount: 2, requiredBy: new Date('2026-01-20T00:00:00Z'), note: 'before Diwali',
    requestedByName: 'Anita', createdAt: new Date('2026-01-15T00:00:00Z'),
    items: [{ materialName: 'Wheat', qtyKg: 500, uom: 'kg', lineStatus: 'NEEDS_PO', tagName: 'Mill' }, { materialName: 'Oil', qtyKg: 20, uom: 'L' }],
  };

  it('get_purchase_requests finds a REQUESTED request using the real status field', async () => {
    const svc = makeService();
    svc.purchaseRequestModel.find.mockReturnValue(query([pr]));
    const res: any = await svc.execute('get_purchase_requests', { status: 'requested' });
    expect(svc.purchaseRequestModel.find.mock.calls[0][0]).toMatchObject({
      status: 'REQUESTED',
      isTest: { $ne: true },
      parentId: { $exists: false },
    });
    expect(res.total).toBe(1);
    expect(res.requests[0]).toMatchObject({
      reqNo: 'PR-0007', status: 'REQUESTED', stage: 'NEEDS_PO', priority: 'URGENT',
      requestedBy: 'Anita', requiredBy: '20 Jan 2026', items: ['Wheat 500kg', 'Oil 20L'],
    });
  });

  it('get_purchase_requests can filter by derived stage, department and priority', async () => {
    const svc = makeService();
    await svc.execute('get_purchase_requests', { stage: 'awaiting_approval', department: 'packing', priority: 'urgent' });
    expect(svc.purchaseRequestModel.find.mock.calls[0][0]).toMatchObject({
      stage: 'AWAITING_APPROVAL', department: 'PACKING', priority: 'URGENT',
    });
  });

  it('get_purchase_request_detail requires a reqNo', async () => {
    const res: any = await makeService().execute('get_purchase_request_detail', {});
    expect(res.error).toMatch(/reqNo required/);
  });

  it('get_purchase_request_detail reports a missing request', async () => {
    const res: any = await makeService().execute('get_purchase_request_detail', { reqNo: 'PR-9999' });
    expect(res.error).toMatch(/not found/);
  });

  it('get_purchase_request_detail returns line items, PO summary and actors', async () => {
    const svc = makeService();
    svc.purchaseRequestModel.findOne.mockReturnValue(
      query({ ...pr, po: { poNo: 'PO-3', vendorName: 'Agro Co', totalAmount: 25000, expectedDelivery: '2026-01-25' }, approvedBy: { name: 'Meera', at: new Date('2026-01-16T00:00:00Z') } }),
    );
    const res: any = await svc.execute('get_purchase_request_detail', { reqNo: 'pr-0007' });
    expect(res).toMatchObject({
      reqNo: 'PR-0007', stage: 'NEEDS_PO', requestedBy: 'Anita',
      po: { poNo: 'PO-3', vendorName: 'Agro Co', totalAmount: 25000 },
      approvedBy: 'Meera',
    });
    expect(res.items[0]).toEqual({ material: 'Wheat', qty: '500 kg', lineStatus: 'NEEDS_PO', tag: 'Mill' });
  });

  it('get_purchase_vendors lists only active vendors', async () => {
    const svc = makeService();
    svc.purchaseVendorModel.find.mockReturnValue(query([{ name: 'Agro Co', phone: '1', email: 'a@b.c', gstin: 'G', paymentTerms: 'Net 15' }]));
    const res: any = await svc.execute('get_purchase_vendors', {});
    expect(svc.purchaseVendorModel.find.mock.calls[0][0]).toEqual({ isActive: true });
    expect(res.vendors[0]).toMatchObject({ name: 'Agro Co', paymentTerms: 'Net 15' });
  });

  it('get_purchase_materials searches by escaped name among active materials', async () => {
    const svc = makeService();
    svc.purchaseMaterialModel.find.mockReturnValue(query([{ name: 'Wheat', uom: 'kg', category: 'GRAINS_MILLETS', notes: 'sharbati', lastRate: 32 }]));
    const res: any = await svc.execute('get_purchase_materials', { searchTerm: 'whe(at' });
    expect(svc.purchaseMaterialModel.find.mock.calls[0][0]).toEqual({
      isActive: true,
      name: { $regex: 'whe\\(at', $options: 'i' },
    });
    expect(res.materials[0]).toMatchObject({ name: 'Wheat', uom: 'kg', category: 'GRAINS_MILLETS', lastRate: 32 });
  });
});
