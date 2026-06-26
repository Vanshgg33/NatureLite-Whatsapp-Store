'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';

// Prevent Render free-tier cold starts: ping the health endpoint every 14 minutes
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api/v1';
function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${API_URL}/health`, { method: 'GET' }).catch(() => {});
    const id = setInterval(ping, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
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
    </QueryClientProvider>
  );
}
