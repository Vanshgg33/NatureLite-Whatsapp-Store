import { Controller, Get, Global, INestApplication, Module, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { AdminModule } from './admin.module';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

// Boots the REAL AdminModule (schemas, forFeature models, re-exports, controllers, guards) with only the
// database connection faked, so DI problems that unit tests can't see (e.g. a model not exported) show up here.
const USERS: Record<string, any> = {
  super: { role: 'superadmin', isActive: true },
  restricted: { role: 'admin', isActive: true, accessRole: 'r1', permissions: [], deniedPermissions: [] },
  denied: { role: 'admin', isActive: true, accessRole: 'r1', permissions: [], deniedPermissions: ['po.approve'] },
  legacy: { role: 'admin', isActive: true, permissions: ['po.approve'] },
};
const chain = (v: unknown) => ({ select: () => ({ lean: async () => v }) });
const stubModel = (name: string) => ({
  modelName: name,
  collection: { dropIndex: async () => undefined },
  syncIndexes: async () => undefined,
  findById: (id: string) =>
    name === 'AccessRole'
      ? chain({ name: 'Order Manager', permissions: ['admin.orders.view', 'po.approve'] })
      : chain(USERS[id] ?? null),
});

@Global()
@Module({
  providers: [
    { provide: getConnectionToken(), useValue: { models: {}, model: (n: string) => stubModel(n) } },
    { provide: AuditService, useValue: { log: async () => null } },
  ],
  exports: [getConnectionToken(), AuditService],
})
class FakeInfraModule {}

// Same shape as PurchaseModule: owns a PermissionGuard but registers no models itself.
@Controller('feature')
class FeatureController {
  @Get('approve') @UseGuards(PermissionGuard) @RequirePermission('po.approve') approve() { return 'ok'; }
  @Get('orders') @RequireAccess('orders.view') orders() { return 'ok'; }
  @Get('edit') @RequireAccess('orders.edit') edit() { return 'ok'; }
}
@Module({ controllers: [FeatureController], providers: [PermissionGuard] })
class FeatureModule {}

describe('real AdminModule wiring', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [FakeInfraModule, AdminModule, FeatureModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      const id = req.headers['x-user'] as string;
      if (id) req.user = { sub: id, role: USERS[id]?.role ?? 'admin' };
      next();
    });
    await app.listen(0);
    base = await app.getUrl();
  });
  afterAll(() => app.close());

  const get = async (path: string, user: string) => {
    const r = await fetch(base + path, { headers: { 'x-user': user } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  it('boots, and superadmin can read the permission registry', async () => {
    const r = await get('/admin/roles/registry', 'super');
    expect(r.status).toBe(200);
    expect(r.body.map((p: any) => p.page)).toEqual(expect.arrayContaining(['orders', 'purchase', 'billing_books']));
  });

  it('roles API is superadmin-only', async () => expect((await get('/admin/roles', 'restricted')).status).toBe(403));

  it('/admin/access/me reports the effective permissions of a restricted user', async () => {
    const r = await get('/admin/access/me', 'restricted');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ restricted: true, roleName: 'Order Manager' });
    expect(r.body.permissions).toEqual(expect.arrayContaining(['admin.orders.view', 'po.approve']));
  });

  it('/admin/access/me is unrestricted for superadmin and legacy admins', async () => {
    expect((await get('/admin/access/me', 'super')).body.restricted).toBe(false);
    expect((await get('/admin/access/me', 'legacy')).body.restricted).toBe(false);
  });

  it('AccessGuard resolves in another module and enforces the role', async () => {
    expect((await get('/feature/orders', 'restricted')).status).toBe(200);
    expect((await get('/feature/edit', 'restricted')).status).toBe(403);
    expect((await get('/feature/edit', 'legacy')).status).toBe(200);
  });

  it('PermissionGuard (Purchase) honours role grants, own grants and per-user denials', async () => {
    expect((await get('/feature/approve', 'restricted')).status).toBe(200); // via role
    expect((await get('/feature/approve', 'legacy')).status).toBe(200); // own permission, no role
    expect((await get('/feature/approve', 'denied')).status).toBe(403); // role grants it, user denial wins
  });
});
