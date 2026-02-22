'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf } from 'lucide-react';

interface LoadingContextType {
  isInitialLoad: boolean;
  hasLoadedOnce: boolean;
}

const LoadingContext = createContext<LoadingContextType>({
  isInitialLoad: true,
  hasLoadedOnce: false,
});

export const useLoading = () => useContext(LoadingContext);

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    // Check if we've already shown the loader in this session
    const hasLoaded = sessionStorage.getItem('naturelite-loaded');

    if (hasLoaded) {
      setIsInitialLoad(false);
      setHasLoadedOnce(true);
      return;
    }

    // Quick load - no heavy animations
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
      setHasLoadedOnce(true);
      sessionStorage.setItem('naturelite-loaded', 'true');
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <LoadingContext.Provider value={{ isInitialLoad, hasLoadedOnce }}>
      {/* Simple loading overlay */}
      <AnimatePresence>
        {isInitialLoad && !hasLoadedOnce && (
          <motion.div
            className="fixed inset-0 z-[100] bg-brand-cream flex flex-col items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-16 h-16 rounded-full bg-brand-mustard/20 flex items-center justify-center mb-4">
              <Leaf className="w-8 h-8 text-brand-mustard" />
            </div>
            <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-2">
              Naturelite
            </h1>
            <p className="text-brand-muted text-sm">Loading...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </LoadingContext.Provider>
  );
}
