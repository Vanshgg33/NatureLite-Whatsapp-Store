import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import CrmShell from '@/components/crm/CrmShell';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'NatureLite CRM',
    template: '%s · NatureLite CRM',
  },
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${dmSans.variable} ${fraunces.variable}`}>
      <CrmShell>{children}</CrmShell>
    </div>
  );
}
