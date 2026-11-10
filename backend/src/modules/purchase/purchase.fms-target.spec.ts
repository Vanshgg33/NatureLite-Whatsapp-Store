import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';

// users.manage must only ever act on non-superadmin FMS logins.
function makeService(exists: boolean) {
  const adminModel = { exists: jest.fn().mockResolvedValue(exists ? { _id: 'x' } : null), findByIdAndUpdate: jest.fn() } as any;
  const svc = new (PurchaseService as any)(null, null, null, adminModel, null, null);
  return { svc: svc as PurchaseService, adminModel };
}
const ID = '507f1f77bcf86cd799439011';

describe('FMS user management targets', () => {
  it('queries for non-superadmin FMS users only and rejects other targets', async () => {
    const { svc, adminModel } = makeService(false);
    await expect(svc.resetFmsUserPassword(ID, 'longenough1')).rejects.toThrow(NotFoundException);
    const q = adminModel.exists.mock.calls[0][0];
    expect(q.role).toEqual({ $ne: 'superadmin' });
    expect(adminModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('only a superadmin may assign an access role', async () => {
    const { svc } = makeService(true);
    await expect(svc.updateFmsUser({ role: 'admin' } as any, ID, { accessRole: ID })).rejects.toThrow(ForbiddenException);
  });
  it('rejects short passwords', async () => {
    const { svc } = makeService(true);
    await expect(svc.resetFmsUserPassword(ID, 'short')).rejects.toThrow('at least 8');
  });
});
