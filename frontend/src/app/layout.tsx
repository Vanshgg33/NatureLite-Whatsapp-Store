import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import './globals.css';
import { Providers } from '@/components/providers';

const fontVariables = {
  '--font-inter': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--font-playfair': 'Georgia, "Times New Roman", serif',
  '--font-source-sans': '"Source Sans 3", system-ui, sans-serif',
} as CSSProperties & Record<string, string>;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:8001';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Purity Foods | Traditional Wood-Pressed Oils & Bilona Ghee',
    template: '%s | Purity Foods',
  },
  description:
    'Experience the authentic taste of tradition with our wood-pressed oils and bilona ghee. Farm to bottle purity, crafted the way nature intended.',
  keywords: [
    'wood-pressed oil',
    'bilona ghee',
    'mustard oil',
    'traditional Indian food',
    'organic oils',
    'cold-pressed oil',
    'natural food',
  ],
  authors: [{ name: 'Purity Foods' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Purity Foods',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      style={fontVariables}
      suppressHydrationWarning
    >
      <body className="font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
