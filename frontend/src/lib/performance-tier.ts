'use client';

export type PerformanceTier = 'high' | 'medium' | 'low';

interface PerformanceMetrics {
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
  connectionType: string | null;
  reducedMotion: boolean;
  isMobile: boolean;
  isLowPowerMode: boolean;
}

/**
 * Detect device performance tier for adaptive rendering
 */
export function detectPerformanceTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'medium';

  const metrics = getPerformanceMetrics();

  // Low tier conditions
  if (metrics.reducedMotion) return 'low';
  if (metrics.deviceMemory !== null && metrics.deviceMemory < 4) return 'low';
  if (metrics.hardwareConcurrency !== null && metrics.hardwareConcurrency < 4)
    return 'low';
  if (metrics.connectionType === 'slow-2g' || metrics.connectionType === '2g')
    return 'low';
  if (metrics.isLowPowerMode) return 'low';

  // High tier conditions
  if (
    metrics.deviceMemory !== null &&
    metrics.deviceMemory >= 8 &&
    metrics.hardwareConcurrency !== null &&
    metrics.hardwareConcurrency >= 8 &&
    !metrics.isMobile
  ) {
    return 'high';
  }

  // Default to medium
  return 'medium';
}

/**
 * Get detailed performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  if (typeof window === 'undefined') {
    return {
      deviceMemory: null,
      hardwareConcurrency: null,
      connectionType: null,
      reducedMotion: false,
      isMobile: false,
      isLowPowerMode: false,
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
  };

  return {
    deviceMemory: nav.deviceMemory ?? null,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    connectionType: nav.connection?.effectiveType ?? null,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isMobile:
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.matchMedia('(max-width: 768px)').matches,
    isLowPowerMode: nav.connection?.saveData ?? false,
  };
}

/**
 * Get recommended particle count based on performance tier
 */
export function getParticleCount(tier: PerformanceTier): number {
  switch (tier) {
    case 'high':
      return 150;
    case 'medium':
      return 75;
    case 'low':
      return 25;
  }
}

/**
 * Get recommended shadow quality based on performance tier
 */
export function getShadowQuality(
  tier: PerformanceTier
): 'high' | 'medium' | 'low' | 'none' {
  switch (tier) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'none';
  }
}

/**
 * Check if 3D rendering should be enabled
 */
export function should3DRender(tier: PerformanceTier): boolean {
  return tier !== 'low';
}

/**
 * Get recommended animation duration multiplier
 */
export function getAnimationDurationMultiplier(tier: PerformanceTier): number {
  switch (tier) {
    case 'high':
      return 1;
    case 'medium':
      return 0.8;
    case 'low':
      return 0; // No animations
  }
}

/**
 * Hook-like function for performance-aware rendering
 * Can be used in React components
 */
export function usePerformanceTier(): {
  tier: PerformanceTier;
  metrics: PerformanceMetrics;
  shouldAnimate: boolean;
  shouldRender3D: boolean;
  particleCount: number;
} {
  const tier = detectPerformanceTier();
  const metrics = getPerformanceMetrics();

  return {
    tier,
    metrics,
    shouldAnimate: tier !== 'low' && !metrics.reducedMotion,
    shouldRender3D: should3DRender(tier),
    particleCount: getParticleCount(tier),
  };
}
