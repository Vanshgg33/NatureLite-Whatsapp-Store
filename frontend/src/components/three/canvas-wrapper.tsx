'use client';

import { Suspense, ReactNode, useState } from 'react';
import dynamic from 'next/dynamic';
import { detectPerformanceTier, PerformanceTier } from '@/lib/performance-tier';
import { cn } from '@/lib/utils';

interface CanvasWrapperProps {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  minTier?: PerformanceTier;
}

// Loading placeholder
function LoadingFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-brown/20 to-brand-green/20',
        className
      )}
    >
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-brand-mustard/30 border-t-brand-mustard rounded-full animate-spin" />
        <p className="mt-4 font-body text-sm text-brand-muted">Loading 3D scene...</p>
      </div>
    </div>
  );
}

// Static fallback for low-performance devices
function StaticFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-full h-full bg-gradient-to-br from-brand-brown via-brand-brown-light to-brand-green flex items-center justify-center',
        className
      )}
    >
      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-brand-mustard/20 flex items-center justify-center">
          <span className="font-display text-4xl text-brand-cream">P</span>
        </div>
        <p className="font-body text-sm text-brand-cream/60">
          3D view not available on this device
        </p>
      </div>
    </div>
  );
}

/**
 * CanvasWrapper provides a suspense boundary and performance-aware rendering
 * for 3D scenes. It automatically falls back to static content on low-end devices.
 */
export function CanvasWrapper({
  children,
  className,
  fallback,
  minTier = 'medium',
}: CanvasWrapperProps) {
  const [tier] = useState<PerformanceTier>(
    () => typeof window !== 'undefined' ? detectPerformanceTier() : 'medium',
  );
  const [error, setError] = useState(false);

  // If below minimum tier, show static fallback
  const tierOrder: PerformanceTier[] = ['low', 'medium', 'high'];
  if (tierOrder.indexOf(tier) < tierOrder.indexOf(minTier)) {
    return fallback || <StaticFallback className={className} />;
  }

  // If there was an error loading 3D content
  if (error) {
    return fallback || <StaticFallback className={className} />;
  }

  return (
    <div className={cn('relative', className)}>
      <Suspense fallback={<LoadingFallback className={className} />}>
        {children}
      </Suspense>
    </div>
  );
}

export { LoadingFallback, StaticFallback };
