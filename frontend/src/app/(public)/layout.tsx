'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { LoadingProvider } from '@/components/providers/loading-provider';
import { AddToCartAnimationProvider } from '@/components/ecommerce/add-to-cart-animation';
import { SiteSettingsProvider } from '@/lib/site-settings-context';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { PromoBar } from '@/components/layout/promo-bar';
import { ErrorBoundary } from '@/components/error-boundary';
import { StickyCartBar } from '@/components/ecommerce/sticky-cart-bar';
import { PincodeChecker } from '@/components/ecommerce/pincode-checker';
import { WhatsAppFab } from '@/components/ecommerce/whatsapp-fab';
import { AiChatbotFab } from '@/components/ecommerce/ai-chatbot-fab';
import dynamic from 'next/dynamic';

const ScrollProgress = dynamic(
  () => import('@/components/ui/scroll-progress').then(m => ({ default: m.ScrollProgress })),
  { ssr: false }
);

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SiteSettingsProvider>
      <LoadingProvider>
        <AddToCartAnimationProvider>
          <ScrollProgress />
          <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
          <div className="sticky top-0 z-50 w-full">
            <AnnouncementBar />
            <PromoBar />
            <PublicHeader />
          </div>
          <div className="min-h-screen flex flex-col bg-white" style={{ overflowX: 'clip' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={pathname}
                className="flex-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary>{children}</ErrorBoundary>
              </motion.main>
            </AnimatePresence>
            <PublicFooter />
            <StickyCartBar />
          </div>
          <PincodeChecker />
          <AiChatbotFab page={pathname} />
          <WhatsAppFab />
        </AddToCartAnimationProvider>
      </LoadingProvider>
    </SiteSettingsProvider>
  );
}
