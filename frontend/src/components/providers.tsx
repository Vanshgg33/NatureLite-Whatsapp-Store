'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/toaster';
import { APP_TZ, installISTDefaults } from '@/lib/time';

// Prevent Render free-tier cold starts: ping the health endpoint every 14 minutes
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api/v1';
function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${API_URL}/health`, { method: 'GET' }).catch(() => {});
    const id = setInterval(ping, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

installISTDefaults(); // module scope: runs on server render and in the browser

const CLOCK_PREFIXES = ['/admin', '/billing', '/crm', '/fms', '/department'];

/** Live IST clock, pinned on every internal (staff) screen. */
function LiveISTClock() {
  const pathname = usePathname() ?? '';
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now || !CLOCK_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return (
    <div
      className="fixed bottom-3 right-3 z-[60] rounded-full bg-gray-900/90 px-3 py-1 text-xs font-medium tabular-nums text-white shadow-lg print:hidden pointer-events-none"
      title="Indian Standard Time (live)"
    >
      {new Intl.DateTimeFormat('en-IN', {
        timeZone: APP_TZ, day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      }).format(now)} IST
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  useKeepAlive();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            retryDelay: 0,
            refetchOnWindowFocus: false,
            // Keep showing cached data while a refetch or retry is in flight
            // so the screen never flashes empty during a token refresh cycle.
            placeholderData: (prev: unknown) => prev,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
      <LiveISTClock />
    </QueryClientProvider>
  );
}
