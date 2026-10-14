describe('PurchaseService FMS user management', () => {
  it('hashes password correctly (bcrypt)', async () => {
    const bcrypt = require('bcrypt');
    const password = 'Temp@1234';
    const hash = await bcrypt.hash(password, 12);
    const isMatch = await bcrypt.compare(password, hash);
    expect(isMatch).toBe(true);
    expect(hash).not.toBe(password);
  });

  it('ROLE_PRESETS.APPROVER grants po.approve and request.close only', () => {
    const { ROLE_PRESETS } = require('../../common/decorators/require-permission.decorator');
    expect(ROLE_PRESETS.APPROVER).toEqual(['po.approve', 'request.close']);
    expect(ROLE_PRESETS.APPROVER).not.toContain('pr.create');
  });

  it('ROLE_PRESETS.SUPER_ADMIN grants all 11 permissions', () => {
    const { ROLE_PRESETS, PURCHASE_PERMISSIONS } = require('../../common/decorators/require-permission.decorator');
    expect(ROLE_PRESETS.SUPER_ADMIN.length).toBe(PURCHASE_PERMISSIONS.length);
    expect(ROLE_PRESETS.SUPER_ADMIN).toEqual(expect.arrayContaining([...PURCHASE_PERMISSIONS]));
  });

  it('ROLE_PRESETS.REQUESTER grants only pr.create and request.close', () => {
    const { ROLE_PRESETS } = require('../../common/decorators/require-permission.decorator');
    expect(ROLE_PRESETS.REQUESTER).toEqual(['pr.create', 'request.close']);
  });
});
