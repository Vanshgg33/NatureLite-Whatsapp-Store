'use client';

import Script from 'next/script';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { LoadingProvider } from '@/components/providers/loading-provider';
import { AddToCartAnimationProvider } from '@/components/ecommerce/add-to-cart-animation';
import { SocialProofPopup } from '@/components/ecommerce/social-proof-popup';
import { SiteSettingsProvider } from '@/lib/site-settings-context';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { PromoBar } from '@/components/layout/promo-bar';
import { ErrorBoundary } from '@/components/error-boundary';
import { StickyCartBar } from '@/components/ecommerce/sticky-cart-bar';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteSettingsProvider>
      <LoadingProvider>
        <AddToCartAnimationProvider>
          <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
          <div className="sticky top-0 z-50 w-full bg-white">
            <AnnouncementBar />
            <PromoBar />
            <PublicHeader />
          </div>
          <div className="min-h-screen flex flex-col bg-white">
            <main className="flex-1">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <PublicFooter />
          <StickyCartBar />
          </div>
          <SocialProofPopup />
        </AddToCartAnimationProvider>
      </LoadingProvider>
    </SiteSettingsProvider>
  );
}
