import {
  LayoutDashboard, Bell, Target, Users, Layers, Repeat, Gift, GitMerge, ListChecks, Phone, CalendarClock,
  MessageCircle, Megaphone, FileText, Zap, ShoppingCart, UserPlus, TrendingUp, Store, AlertTriangle, Star,
  Receipt, Package, Ticket, Briefcase, BarChart3, Trophy, Sparkles, Shield, ScrollText, Lock, Plug, Settings,
  type LucideIcon,
} from 'lucide-react';

// One place to add a CRM page (CRM Blueprint v2, section 2). `page` = existing permission key; items without it
// are blueprint pages that are not built yet (they render <ComingSoon/>) and are hidden from custom-role users.
export type NavItem = {
  label: string; href: string; icon: LucideIcon;
  module: string;            // blueprint module id
  priority: 'P1' | 'P2' | 'P3';
  page?: string; adminOnly?: boolean; badge?: 'complaints';
};
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [
    { label: 'Today', href: '/crm', icon: LayoutDashboard, module: 'M01', priority: 'P1', page: 'crm_today' },
    { label: 'Digest & Alerts', href: '/crm/digest', icon: Bell, module: 'M02', priority: 'P2' },
    { label: 'Goals', href: '/crm/goals', icon: Target, module: 'M03', priority: 'P2' },
  ] },
  { label: 'Customers', items: [
    { label: 'Customers', href: '/crm/customers', icon: Users, module: 'M04', priority: 'P1', page: 'crm_customers' },
    { label: 'Segments', href: '/crm/segments', icon: Layers, module: 'M09', priority: 'P1' },
    { label: 'Subscriptions', href: '/crm/subscriptions', icon: Repeat, module: 'M07', priority: 'P2' },
    { label: 'Loyalty & Referrals', href: '/crm/loyalty', icon: Gift, module: 'M08', priority: 'P2' },
    { label: 'Duplicates', href: '/crm/customers/duplicates', icon: GitMerge, module: 'M06', priority: 'P1', page: 'crm_duplicates', adminOnly: true },
  ] },
  { label: 'Calling', items: [
    { label: 'Call queue', href: '/crm/queue', icon: ListChecks, module: 'M10', priority: 'P2', page: 'crm_queue' },
    { label: 'Caller mode', href: '/crm/caller', icon: Phone, module: 'M11', priority: 'P1', page: 'crm_caller' },
    { label: 'Callbacks', href: '/crm/callbacks', icon: CalendarClock, module: 'M12', priority: 'P2' },
  ] },
  { label: 'WhatsApp', items: [
    { label: 'Inbox', href: '/crm/inbox', icon: MessageCircle, module: 'M14', priority: 'P1' },
    { label: 'Campaigns', href: '/crm/campaigns', icon: Megaphone, module: 'M16', priority: 'P1', page: 'crm_campaigns' },
    { label: 'Templates', href: '/crm/templates', icon: FileText, module: 'M15', priority: 'P1' },
    { label: 'Automations', href: '/crm/automations', icon: Zap, module: 'M18', priority: 'P1' },
    { label: 'Abandoned carts', href: '/crm/abandoned', icon: ShoppingCart, module: 'M17', priority: 'P1', page: 'crm_abandoned' },
  ] },
  { label: 'Growth', items: [
    { label: 'Leads', href: '/crm/leads', icon: UserPlus, module: 'M19', priority: 'P1' },
    { label: 'Acquisition', href: '/crm/acquisition', icon: TrendingUp, module: 'M20', priority: 'P1' },
    { label: 'Walk-ins', href: '/crm/walk-ins', icon: Store, module: 'M21', priority: 'P2' },
  ] },
  { label: 'Service', items: [
    { label: 'Complaints', href: '/crm/complaints', icon: AlertTriangle, module: 'M22', priority: 'P2', page: 'crm_complaints', badge: 'complaints' },
    { label: 'Feedback', href: '/crm/feedback', icon: Star, module: 'M23', priority: 'P2' },
  ] },
  { label: 'Revenue', items: [
    { label: 'Orders', href: '/crm/orders', icon: Receipt, module: 'M24', priority: 'P1', page: 'crm_orders', adminOnly: true },
    { label: 'Products', href: '/crm/products', icon: Package, module: 'M25', priority: 'P1', page: 'crm_products' },
    { label: 'Attribution & Coupons', href: '/crm/attribution', icon: Ticket, module: 'M26', priority: 'P1' },
  ] },
  { label: 'Reports', items: [
    { label: 'Investor snapshot', href: '/crm/reports/investor', icon: Briefcase, module: 'M27', priority: 'P1' },
    { label: 'Reports hub', href: '/crm/reports', icon: BarChart3, module: 'M28', priority: 'P1' },
    { label: 'Performance', href: '/crm/analytics', icon: Trophy, module: 'M29', priority: 'P2', page: 'crm_analytics' },
    { label: 'Intelligence', href: '/crm/intelligence', icon: Sparkles, module: 'M34', priority: 'P3' },
  ] },
  { label: 'Admin', items: [
    { label: 'Team & roles', href: '/crm/admin/employees', icon: Shield, module: 'M30', priority: 'P2', page: 'crm_team', adminOnly: true },
    { label: 'Audit log', href: '/crm/admin/audit', icon: ScrollText, module: 'M31', priority: 'P2', adminOnly: true },
    { label: 'Consent', href: '/crm/admin/compliance', icon: Lock, module: 'M32', priority: 'P2', adminOnly: true },
    { label: 'Integrations', href: '/crm/admin/integrations', icon: Plug, module: 'M33', priority: 'P3', adminOnly: true },
    { label: 'Settings', href: '/crm/settings', icon: Settings, module: 'Settings', priority: 'P1', page: 'crm_settings', adminOnly: true },
  ] },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const navItemForPath = (pathname: string) =>
  ALL_NAV_ITEMS.find((i) => i.href === pathname) ?? ALL_NAV_ITEMS.find((i) => i.href !== '/crm' && pathname.startsWith(i.href + '/'));
