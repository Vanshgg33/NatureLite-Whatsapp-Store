import type { Metadata } from 'next';
import { Inter, Playfair_Display, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
});

export const metadata: Metadata = {
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
      className={`${inter.variable} ${playfair.variable} ${sourceSans.variable}`}
      suppressHydrationWarning
    >
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
