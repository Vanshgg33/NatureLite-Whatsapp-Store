import * as fs from 'fs';
import * as path from 'path';
import { ADMIN_PAGES, ALL_ADMIN_PERMISSIONS } from './admin-pages';

describe('ADMIN_PAGES registry', () => {
  it('has unique pages and permission strings, with View first on every page', () => {
    expect(new Set(ADMIN_PAGES.map((p) => p.page)).size).toBe(ADMIN_PAGES.length);
    expect(new Set(ALL_ADMIN_PERMISSIONS).size).toBe(ALL_ADMIN_PERMISSIONS.length);
    ADMIN_PAGES.forEach((p) => expect(p.actions[0].key).toBe('view'));
  });

  it('every page is routable in the frontend (frontend/src/lib/admin-access.ts)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../../frontend/src/lib/admin-access.ts'), 'utf8');
    ADMIN_PAGES.forEach((p) => expect(src).toContain(`page: '${p.page}'`));
  });
});
