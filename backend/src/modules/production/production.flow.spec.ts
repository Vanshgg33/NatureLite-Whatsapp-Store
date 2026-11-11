import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { Ctx, ProductionService } from './production.service';
import * as S from './production.schemas';

jest.setTimeout(120_000);

// Opt-in: needs a MongoDB *replica set* (transactions). Uses a throwaway database that is dropped afterwards.
//   PROD_TEST_MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" npx jest production.flow
const URI = process.env.PROD_TEST_MONGO_URI;
(URI ? describe : describe.skip)('production ledger (real MongoDB transactions)', () => {
  let svc: ProductionService;
  let moduleRef: any;
  let c: Ctx;
  const store = new Types.ObjectId().toString();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(URI!, { dbName: `prodtest_${Date.now()}` }),
        MongooseModule.forFeature([
          { name: S.ProdItem.name, schema: S.ProdItemSchema }, { name: S.ProdLocation.name, schema: S.ProdLocationSchema },
          { name: S.ProdMachine.name, schema: S.ProdMachineSchema }, { name: S.ProdMovement.name, schema: S.ProdMovementSchema },
          { name: S.ProdBalance.name, schema: S.ProdBalanceSchema }, { name: S.ProdEntry.name, schema: S.ProdEntrySchema },
          { name: S.ProdCounter.name, schema: S.ProdCounterSchema }, { name: S.ProdOutbox.name, schema: S.ProdOutboxSchema },
          { name: S.ProdSettings.name, schema: S.ProdSettingsSchema }, { name: S.ProdEvidence.name, schema: S.ProdEvidenceSchema },
        ]),
      ],
      providers: [ProductionService,
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => 'http://erp' } }],
    }).compile();
    svc = moduleRef.get(ProductionService);
    c = { storeId: store, user: { sub: new Types.ObjectId().toString(), name: 'Tester', role: 'admin', phone: '1' } as any };

    ids.loc = String((await svc.saveLocation(c, { name: 'Main' }) as any)._id);
    ids.peanut = String((await svc.saveItem(c, { kind: 'material', code: 'PNT', name: 'Peanuts', baseUnit: 'kg' }) as any)._id);
    ids.oil = String((await svc.saveItem(c, { kind: 'product', code: 'PO', name: 'Peanut oil', baseUnit: 'L', kgPerL: 0.91 }) as any)._id);
    ids.bottle = String((await svc.saveItem(c, { kind: 'product', code: 'PO1', name: 'Peanut oil 1L', baseUnit: 'pcs', form: 'packed' }) as any)._id);
    await svc.saveMachine(c, { code: 'OIL-01', name: 'Expeller 1' });
    await svc.saveMachine(c, { code: 'OIL-02', name: 'Expeller 2' });
    await svc.saveSettings(c, { receipt: ['a@x.com', 'b@x.com'] });
  });

  afterAll(async () => {
    await moduleRef?.get(require("@nestjs/mongoose").getConnectionToken())?.dropDatabase();
    await moduleRef?.close();
  });

  const bal = async (item: string) => (await svc.balances(c, {})).find((b: any) => String(b.item._id) === item)?.qty;

  it('receipt + issue + return reconciles: net 50, stock 50', async () => {
    const r = await svc.receive(c, { item: ids.peanut, location: ids.loc, qty: 100, unit: 'kg', supplier: 'Farm', idemKey: 'k1' });
    expect(r.balance).toBe(100);
    expect(r.notification).toBe('queued');
    const dup = await svc.receive(c, { item: ids.peanut, location: ids.loc, qty: 100, unit: 'kg', idemKey: 'k1' });
    expect(dup.duplicate).toBe(true);
    expect(await bal(ids.peanut)).toBe(100);
    expect(await moduleRef.get(getModelToken(S.ProdOutbox.name)).countDocuments()).toBe(2);

    const iss: any = await svc.issue(c, { item: ids.peanut, location: ids.loc, qty: 60, unit: 'kg', destination: 'Press' });
    ids.issueRef = iss.movement.ref;
    await expect(svc.returnMaterial(c, { issueRef: ids.issueRef, qty: 61, unit: 'kg' })).rejects.toThrow(/exceeds/);
    await svc.returnMaterial(c, { issueRef: ids.issueRef, qty: 10, unit: 'kg' });
    expect(await bal(ids.peanut)).toBe(50);
    const [row] = await svc.issues(c, {});
    expect([row.issued, row.returned, row.net]).toEqual([60, 10, 50]);
  });

  it('blocks insufficient stock and never overspends under concurrency', async () => {
    await expect(svc.issue(c, { item: ids.peanut, location: ids.loc, qty: 500, unit: 'kg', destination: 'X' })).rejects.toThrow(/Insufficient/);
    const res = await Promise.allSettled([1, 2].map(() => svc.issue(c, { item: ids.peanut, location: ids.loc, qty: 30, unit: 'kg', destination: 'Y' })));
    const ok = res.filter((x) => x.status === 'fulfilled').length;
    expect(await bal(ids.peanut)).toBe(50 - 30 * ok);
    expect(ok).toBe(1);
  });

  it('machine aggregation, post, packing, reversal', async () => {
    const e: any = await svc.saveEntry(c, { product: ids.oil, location: ids.loc, operator: 'Ram', rows: [{ machine: 'OIL-01', qty: 60, unit: 'L' }, { machine: 'OIL-02', qty: 40, unit: 'L' }] });
    expect(e.total).toBe(100);
    expect(await bal(ids.oil)).toBeUndefined(); // drafts do not touch stock
    const posted: any = await svc.postEntry(c, String(e._id));
    expect(posted.balance).toBe(100);
    await expect(svc.postEntry(c, String(e._id))).rejects.toThrow(/not a draft/);
    await svc.pack(c, { item: ids.oil, location: ids.loc, qty: 50, unit: 'L', destination: 'BATCH-1', packedItem: ids.bottle, packedQty: 50, packedUnit: 'pcs' });
    expect(await bal(ids.oil)).toBe(50);
    expect(await bal(ids.bottle)).toBe(50);
    await expect(svc.reverse(c, { movementId: String(posted.movement._id), reason: 'wrong' })).rejects.toThrow(/Insufficient/);
    const out: any = await svc.reportOutput(c, { dimension: 'machine' });
    expect(Object.fromEntries(out.rows.map((r: any) => [r.key, r.qty]))).toEqual({ 'OIL-01': 60, 'OIL-02': 40 });
    const fin: any[] = await svc.reportFinished(c, {});
    expect(fin.find((f) => f.code === 'PO')).toMatchObject({ produced: 100, packedOut: 50 });
  });

  it('converts kg to L with the configured factor and keeps history immutable', async () => {
    const r: any = await svc.receive(c, { item: ids.oil, location: ids.loc, qty: 91, unit: 'kg' });
    expect(r.movement.converted).toBe(true);
    expect(r.movement.qty).toBe(100);
    await svc.saveItem(c, { kgPerL: 0.5 }, ids.oil);
    const m: any = await svc.ledger(c, { q: r.movement.ref });
    expect(m.data[0].qty).toBe(100);
    expect(m.data[0].factor).toBe(0.91);
    await expect(svc.receive(c, { item: ids.peanut, location: ids.loc, qty: 1, unit: 'L' })).rejects.toThrow(/No kg\/L factor/);
  });

  it('enforces tag vocabulary and the receipt-photo setting', async () => {
    await svc.saveTags(c, ['organic']);
    await expect(svc.saveItem(c, { tags: ['bogus'] }, ids.peanut)).rejects.toThrow(/Unknown tag/);
    await svc.saveItem(c, { tags: ['organic'] }, ids.peanut);
    await svc.saveSettings(c, { requireReceiptPhoto: true });
    await expect(svc.receive(c, { item: ids.peanut, location: ids.loc, qty: 1, unit: 'kg' })).rejects.toThrow(/photo is required/);
    await svc.saveSettings(c, { requireReceiptPhoto: false });
  });

  it('reversing a return restores the unreturned balance of its issue', async () => {
    const iss: any = await svc.issue(c, { item: ids.peanut, location: ids.loc, qty: 5, unit: 'kg', destination: 'T' });
    const ret: any = await svc.returnMaterial(c, { issueRef: iss.movement.ref, qty: 2, unit: 'kg' });
    await svc.reverse(c, { movementId: String(ret.movement._id), reason: 'x' });
    const row = (await svc.issues(c, {})).find((i: any) => i.ref === iss.movement.ref);
    expect([row.returned, row.net]).toEqual([0, 5]);
  });

  it('reverses a receipt with a compensating row and EOD reconciles', async () => {
    const r: any = await svc.receive(c, { item: ids.peanut, location: ids.loc, qty: 5, unit: 'kg' });
    const before = await bal(ids.peanut);
    await svc.reverse(c, { movementId: String(r.movement._id), reason: 'typo' });
    expect(await bal(ids.peanut)).toBe(before - 5);
    await expect(svc.reverse(c, { movementId: String(r.movement._id), reason: 'again' })).rejects.toThrow(/already reversed/);
    const eod: any = await svc.eod(c, {});
    for (const row of eod.rows) {
      expect(row.opening + row.receipts + row.returns + row.output + row.adjustments - row.issues - row.waste - row.packing).toBeCloseTo(row.closing, 5);
    }
  });
});
