import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AccessRolesService } from './access-roles.service';

const by = { id: 'admin1' };
const oid = () => new Types.ObjectId().toString();

function setup(opts: { existingNames?: string[]; usersWithRole?: number; role?: any } = {}) {
  const saved: any[] = [];
  const role = opts.role && { ...opts.role, save: jest.fn(async function (this: any) { return this; }) };
  const roleModel: any = {
    exists: jest.fn(async (q: { name: string }) => (opts.existingNames ?? []).includes(q.name)),
    create: jest.fn(async (doc: any) => { saved.push(doc); return { _id: oid(), ...doc }; }),
    findById: jest.fn(async () => role ?? null),
    findByIdAndDelete: jest.fn(async () => role ?? null),
  };
  const userModel: any = { countDocuments: jest.fn(async () => opts.usersWithRole ?? 0) };
  const audit = { log: jest.fn(async () => null) };
  return { svc: new AccessRolesService(roleModel, userModel, audit as any), roleModel, audit, saved, role };
}

describe('AccessRolesService', () => {
  it('creates a role, de-duplicates permissions and writes an audit entry', async () => {
    const { svc, saved, audit } = setup();
    await svc.create({ name: '  Order Manager ', permissions: ['admin.orders.view', 'admin.orders.view', 'po.approve'] }, by);
    expect(saved[0]).toMatchObject({ name: 'Order Manager', permissions: ['admin.orders.view', 'po.approve'] });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'access_role.create' }));
  });

  it('rejects unknown permissions, empty names and duplicate names', async () => {
    await expect(setup().svc.create({ name: 'X', permissions: ['admin.nope.view'] }, by)).rejects.toThrow(BadRequestException);
    await expect(setup().svc.create({ name: '   ' }, by)).rejects.toThrow(BadRequestException);
    await expect(setup({ existingNames: ['Dup'] }).svc.create({ name: 'Dup' }, by)).rejects.toThrow(ConflictException);
  });

  it('updates a role and audits the before/after', async () => {
    const { svc, role, audit } = setup({ role: { name: 'Old', description: '', permissions: ['admin.orders.view'] } });
    await svc.update(oid(), { name: 'New', permissions: ['admin.orders.edit'] }, by);
    expect(role.save).toHaveBeenCalled();
    expect(role).toMatchObject({ name: 'New', permissions: ['admin.orders.edit'] });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'access_role.update', previousValues: { name: 'Old', permissions: ['admin.orders.view'] } }));
  });

  it('update: 404 for a missing role, 409 when renaming onto an existing name', async () => {
    await expect(setup().svc.update(oid(), { name: 'A' }, by)).rejects.toThrow(NotFoundException);
    const s = setup({ existingNames: ['Taken'], role: { name: 'Mine', permissions: [] } });
    await expect(s.svc.update(oid(), { name: 'Taken' }, by)).rejects.toThrow(ConflictException);
  });

  it('refuses to delete a role that still has users, and deletes an unused one', async () => {
    await expect(setup({ usersWithRole: 2 }).svc.remove(oid(), by)).rejects.toThrow(/2 user/);
    const s = setup({ role: { name: 'Unused', permissions: [] } });
    await expect(s.svc.remove(oid(), by)).resolves.toBeUndefined();
    expect(s.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'access_role.delete' }));
  });

  it('rejects malformed ids', async () => {
    await expect(setup().svc.remove('not-an-id', by)).rejects.toThrow();
  });
});
