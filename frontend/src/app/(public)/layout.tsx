'use client';

import Script from 'next/script';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { LoadingProvider } from '@/components/providers/loading-provider';
import { AddToCartAnimationProvider } from '@/components/ecommerce/add-to-cart-animation';
import { SocialProofPopup } from '@/components/ecommerce/social-proof-popup';
import { SiteSettingsProvider } from '@/lib/site-settings-context';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { ErrorBoundary } from '@/components/error-boundary';

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
          <AnnouncementBar />
          <div className="min-h-screen flex flex-col bg-white">
            <PublicHeader />
            <main className="flex-1">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <PublicFooter />
          </div>
          <SocialProofPopup />
        </AddToCartAnimationProvider>
      </LoadingProvider>
    </SiteSettingsProvider>
  );
}
