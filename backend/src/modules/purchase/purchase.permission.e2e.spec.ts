import 'reflect-metadata';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('Purchase endpoint permission mapping', () => {
  it('createRequest endpoint is decorated with pr.create', () => {
    const { PurchaseController } = require('./purchase.controller');
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.createRequest);
    expect(meta).toBe('pr.create');
  });

  it('splitPO endpoint is decorated with po.raise', () => {
    const { PurchaseController } = require('./purchase.controller');
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.splitPO);
    expect(meta).toBe('po.raise');
  });

  it('makeDecision endpoint is decorated with po.approve', () => {
    const { PurchaseController } = require('./purchase.controller');
    const ctrl = new PurchaseController({} as any);
    const meta = Reflect.getMetadata(PERMISSION_KEY, ctrl.makeDecision);
    expect(meta).toBe('po.approve');
  });
});
