'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { ReportPage, Card } from '@/components/crm/ReportPage';

// Hub of the reports that exist. Scheduling and CSV/PDF export are not built.
const REPORTS = [
  { href: '/crm/reports/investor', title: 'Investor snapshot', text: 'Revenue, growth, new vs repeat, 90-day repeat, cohort retention.' },
  { href: '/crm/acquisition', title: 'Acquisition & CAC', text: 'Cost to win a customer by channel.' },
  { href: '/crm/attribution', title: 'Revenue recovered by CRM', text: 'Orders that followed a call.' },
  { href: '/crm/analytics', title: 'Agent performance', text: 'Calls, conversions and revenue per agent.' },
  { href: '/crm/segments', title: 'Segments', text: 'Win-back, price-sensitive, cross-sell audiences.' },
  { href: '/crm/orders', title: 'Orders & sync health', text: 'All orders with 90-day totals.' },
  { href: '/crm/feedback', title: 'Feedback', text: 'Ratings and recent reviews.' },
  { href: '/crm/complaints', title: 'Complaints', text: 'Open and overdue complaints.' },
  { href: '/crm/abandoned', title: 'Abandoned carts', text: 'Carts left unpaid in the last 7 days.' },
];

export default function CrmReportsHub() {
  return (
    <ReportPage title="Reports hub" icon={BarChart3} note="Links to the reports that are built. Scheduled delivery and CSV/PDF export are not built.">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(r => (
          <Link key={r.href} href={r.href}>
            <Card><h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>{r.title}</h2><p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{r.text}</p></Card>
          </Link>
        ))}
      </div>
    </ReportPage>
  );
}
