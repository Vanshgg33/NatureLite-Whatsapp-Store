// Single source of truth for the page/action permissions an access role can grant.
// Permission strings are `admin.<page>.<action>`, except `raw` actions, which keep the legacy key
// as-is (Purchase FMS: `po.approve`, ...). The frontend fetches this list from GET /admin/roles/registry.
// `enforced: false` = the page is hidden in the UI but its API is not yet permission-checked.

export interface PermissionAction {
  key: string;
  label: string;
  /** Full permission string stored on roles/users. */
  permission: string;
}

export interface AdminPageDef {
  page: string;
  label: string;
  group: string;
  href: string;
  enforced: boolean;
  actions: PermissionAction[];
}

type ActionInput = { key: string; label: string; raw?: boolean };
const a = (key: string, label: string): ActionInput => ({ key, label });
const raw = (key: string, label: string): ActionInput => ({ key, label, raw: true });

const def = (
  page: string, label: string, group: string, href: string, enforced: boolean, actions: ActionInput[],
): AdminPageDef => ({
  page, label, group, href, enforced,
  actions: actions.map((x) => ({ key: x.key, label: x.label, permission: x.raw ? x.key : `admin.${page}.${x.key}` })),
});

export const ADMIN_PAGES: AdminPageDef[] = [
  def('dashboard', 'Dashboard', 'Overview', '/admin/dashboard', false, [a('view', 'View')]),
  // The chatbot's tools read orders, customers, wallets, payments and audit logs, so View here is effectively read access to everything.
  def('chatbot', 'AI Chatbot (can read all business data)', 'Overview', '/admin/chatbot', true, [a('view', 'View')]),

  def('products', 'Products', 'Catalogue', '/admin/products', true, [
    a('view', 'View'), a('create', 'Create'), a('edit', 'Edit'), a('stock', 'Update stock'), a('delete', 'Delete'),
    a('import', 'Import CSV'), a('export', 'Export CSV'),
  ]),
  def('ucm', 'UCM', 'Catalogue', '/admin/ucm', true, [a('view', 'View'), a('sync', 'Sync / edit config')]),
  def('categories', 'Categories', 'Catalogue', '/admin/categories', true, [
    a('view', 'View'), a('create', 'Create'), a('edit', 'Edit'), a('delete', 'Delete'),
  ]),

  def('sales', 'Sales Log', 'Operations', '/admin/sales', true, [
    a('view', 'View'), a('create', 'Log sale'), a('edit', 'Edit sale'), a('invoice', 'Upload / send invoice'),
  ]),
  def('orders', 'Orders', 'Operations', '/admin/orders', true, [
    a('view', 'View'), a('create', 'Create order'), a('edit', 'Edit / change status'), a('assign_delivery', 'Assign delivery'),
    a('payments', 'Payment status & proof'), a('returns', 'Handle returns'), a('reopen', 'Reopen order'),
    a('invoice', 'Invoice'), a('delete', 'Delete'),
  ]),
  def('delivery_collections', 'Cash Ledger', 'Operations', '/admin/delivery-collections', true, [
    a('view', 'View'), a('settle', 'Settle collections'),
  ]),
  def('delivery_history', 'Delivery History', 'Operations', '/admin/delivery-history', true, [a('view', 'View')]),

  def('factory_dashboard', 'Factory Dashboard', 'Factory', '/admin/factory-dashboard', true, [a('view', 'View')]),
  def('ims', 'IMS', 'Factory', '/admin/ims', true, [a('view', 'View'), a('edit', 'Update stock')]),
  def('pms', 'PMS', 'Factory', '/admin/pms', true, [
    a('view', 'View'), a('create', 'Add material'), a('edit', 'Edit entries'), a('delete', 'Delete'),
  ]),
  def('production', 'Production (RMS+PMS ledger)', 'Factory', '/admin/production', true, [
    a('view', 'View'), a('receive', 'Receive material'), a('issue', 'Issue to production'), a('return', 'Return material'),
    a('adjust', 'Adjust / waste / count'), a('reverse', 'Reverse entries'), a('produce', 'Production entries'),
    a('pack', 'Packing issues'), a('master', 'Manage items, machines, locations'), a('settings', 'Email settings & log'),
  ]),
  def('rms', 'RMS', 'Factory', '/admin/rms', true, [a('view', 'View'), a('edit', 'Edit entries')]),
  // Purchase FMS actions reuse the legacy keys already enforced by PermissionGuard; only "View" is UI-level.
  def('purchase', 'Purchase FMS', 'Factory', '/fms/purchase', true, [
    a('view', 'View'),
    raw('pr.create', 'Create purchase request'), raw('po.raise', 'Raise PO'), raw('po.approve', 'Approve PO'),
    raw('delivery.receive', 'Receive delivery'), raw('request.close', 'Close request'),
    raw('request.cancel', 'Cancel request'), raw('deadline.set', 'Set deadline'),
    raw('materials.manage', 'Manage materials'), raw('tags.manage', 'Manage tags'),
    raw('vendors.manage', 'Manage vendors'), raw('users.manage', 'Manage purchase users'),
  ]),

  def('customers', 'Customers', 'Customers', '/admin/customers', true, [
    a('view', 'View'), a('create', 'Create'), a('edit', 'Edit'), a('block', 'Block / unblock'),
  ]),
  def('coupons', 'Coupons', 'Customers', '/admin/coupons', true, [
    a('view', 'View'), a('create', 'Create'), a('edit', 'Edit'), a('delete', 'Delete'),
  ]),

  def('billing_new', 'New Bill', 'Billing', '/billing/new', true, [a('view', 'View'), a('create', 'Create bill'), a('cancel', 'Cancel bill')]),
  def('billing_dashboard', 'Billing Dashboard', 'Billing', '/billing/dashboard', true, [a('view', 'View')]),
  def('billing_customers', 'Billing Customers', 'Billing', '/billing/customers', true, [
    a('view', 'View'), a('create', 'Create'), a('edit', 'Edit'),
  ]),
  def('billing_pricing', 'Tag Pricing', 'Billing', '/billing/pricing', true, [a('view', 'View'), a('edit', 'Edit prices')]),
  def('billing_dues', 'Unpaid Dues', 'Billing', '/billing/dues', true, [a('view', 'View'), a('record', 'Record payment')]),
  def('billing_reports', 'Sales Reports', 'Billing', '/billing/reports', true, [a('view', 'View & export')]),
  def('billing_books', 'Books & Stock', 'Billing', '/billing/books', true, [
    a('view', 'View'), a('edit', 'Add / edit entries'), a('delete', 'Delete / cancel entries'),
  ]),
  def('billing_insights', 'Customer Insights', 'Billing', '/billing/insights', true, [a('view', 'View')]),
  def('billing_gstr1', 'GSTR-1', 'Billing', '/billing/gstr1', true, [a('view', 'View')]),
  def('billing_tax', 'Tax & Compliance', 'Billing', '/billing/settings/tax', true, [a('view', 'View'), a('edit', 'Edit rules')]),

  def('crm_today', 'CRM Today', 'CRM', '/crm', true, [a('view', 'View')]),
  def('crm_queue', 'Call Queue', 'CRM', '/crm/queue', true, [a('view', 'View'), a('act', 'Snooze / dismiss / escalate / assign')]),
  def('crm_abandoned', 'Abandoned Carts', 'CRM', '/crm/abandoned', true, [a('view', 'View')]),
  def('crm_caller', 'Caller Mode', 'CRM', '/crm/caller', true, [a('view', 'View'), a('log', 'Log calls')]),
  def('crm_customers', 'CRM Customers', 'CRM', '/crm/customers', true, [a('view', 'View'), a('edit', 'Notes, tags & nudges')]),
  def('crm_campaigns', 'CRM Campaigns', 'CRM', '/crm/campaigns', true, [
    a('view', 'View'), a('create', 'Create'), a('approve', 'Approve'), a('send', 'Send'), a('delete', 'Delete'),
  ]),
  def('crm_complaints', 'CRM Complaints', 'CRM', '/crm/complaints', true, [a('view', 'View'), a('act', 'Reply, resolve & reassign')]),
  def('crm_products', 'CRM Products', 'CRM', '/crm/products', true, [a('view', 'View')]),
  def('crm_analytics', 'CRM Performance', 'CRM', '/crm/analytics', true, [a('view', 'View')]),
  def('crm_orders', 'CRM Orders', 'CRM', '/crm/orders', true, [a('view', 'View')]),
  def('crm_duplicates', 'CRM Duplicates', 'CRM', '/crm/customers/duplicates', true, [a('view', 'View')]),
  def('crm_settings', 'CRM Settings', 'CRM', '/crm/settings', true, [a('view', 'View'), a('edit', 'Edit')]),
  def('crm_team', 'CRM Team', 'CRM', '/crm/admin', true, [a('view', 'View'), a('manage', 'Manage employees')]),

  // Logins and Roles & Access stay superadmin-only on purpose: delegating them lets a role grant itself everything.
  def('analytics', 'Analytics', 'System', '/admin/analytics', true, [a('view', 'View')]),
  def('whatsapp', 'WhatsApp', 'System', '/admin/whatsapp', true, [a('view', 'View'), a('send', 'Send messages')]),
  def('campaigns', 'Campaigns', 'System', '/admin/campaigns', true, [a('view', 'View'), a('manage', 'Broadcast / retry / cancel / delete')]),
  def('feedback', 'Feedback', 'System', '/admin/feedback', true, [a('view', 'View'), a('manage', 'Respond / change status')]),
  def('appearance', 'Appearance', 'System', '/admin/appearance', true, [a('view', 'View'), a('edit', 'Edit appearance & banners')]),
  def('settings', 'Settings', 'System', '/admin/settings', true, [a('view', 'View'), a('edit', 'Edit store / WhatsApp / chatbot settings')]),
  def('reports', 'Reports', 'System', '/admin/reports', true, [a('view', 'View'), a('edit', 'Edit config / send now')]),
  def('stores_dashboard', 'Stores Dashboard', 'System', '/admin/stores/dashboard', false, [a('view', 'View')]),
  def('stores', 'Manage Stores', 'System', '/admin/stores', false, [a('view', 'View')]),
];

export const ALL_ADMIN_PERMISSIONS: string[] = ADMIN_PAGES.flatMap((p) => p.actions.map((x) => x.permission));

const VALID = new Set(ALL_ADMIN_PERMISSIONS);

export const isValidAdminPermission = (key: string): boolean => VALID.has(key);

/** role grants + per-user grants, minus per-user denials. */
export function effectivePermissions(
  rolePerms: string[] = [],
  userPerms: string[] = [],
  denied: string[] = [],
): string[] {
  const deny = new Set(denied);
  return [...new Set([...rolePerms, ...userPerms])].filter((p) => !deny.has(p));
}
