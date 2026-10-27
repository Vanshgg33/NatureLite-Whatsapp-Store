'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface LoadingContextType { isInitialLoad: boolean; hasLoadedOnce: boolean }
const LoadingContext = createContext<LoadingContextType>({ isInitialLoad: true, hasLoadedOnce: false });
export const useLoading = () => useContext(LoadingContext);

const CSS = `
  @keyframes nl-drop {
    0%   { opacity: 0; transform: scale(0.15) translateY(-10px); }
    55%  { opacity: 1; transform: scale(1) translateY(0px); }
    78%  { opacity: 1; transform: scale(1.06) translateY(3px); }
    100% { opacity: 0; transform: scale(0.5) translateY(32px); }
  }
  @keyframes nl-ring {
    0%   { transform: scale(0.08); opacity: 0.85; }
    100% { transform: scale(7); opacity: 0; }
  }
  @keyframes nl-name {
    0%   { opacity: 0; transform: translateY(10px); filter: blur(4px); }
    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes nl-sub {
    0%   { opacity: 0; letter-spacing: 0.55em; }
    100% { opacity: 1; letter-spacing: 0.32em; }
  }
`;

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce]   = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') { setIsInitialLoad(false); setHasLoadedOnce(true); return; }
    if (sessionStorage.getItem('naturelite-loaded')) { setIsInitialLoad(false); setHasLoadedOnce(true); return; }

    const t = setTimeout(() => {
      setIsInitialLoad(false);
      setHasLoadedOnce(true);
      sessionStorage.setItem('naturelite-loaded', 'true');
    }, 1650);
    return () => clearTimeout(t);
  }, []);

  return (
    <LoadingContext.Provider value={{ isInitialLoad, hasLoadedOnce }}>
      <AnimatePresence>
        {isInitialLoad && !hasLoadedOnce && (
          <motion.div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
            style={{ background: 'radial-gradient(ellipse 140% 120% at 50% 42%, #0b1408 0%, #060a04 55%, #020402 100%)' }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
          >
            <style>{CSS}</style>

            {/* Drop + ripple */}
            <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
              {[0, 1, 2, 3].map(i => (
                <span key={i} style={{
                  position: 'absolute',
                  width: 28, height: 28,
                  borderRadius: '50%',
                  border: `${1.4 - i * 0.15}px solid rgba(214,152,22,${0.75 - i * 0.12})`,
                  animation: `nl-ring 1.8s ${0.52 + i * 0.18}s cubic-bezier(0.15,0,0.75,1) forwards`,
                  opacity: 0,
                }} />
              ))}
              <span style={{
                display: 'block',
                width: 17, height: 23,
                background: 'radial-gradient(ellipse at 36% 26%, #fad060 0%, #d49012 48%, #8a5808 100%)',
                borderRadius: '50% 50% 48% 48% / 38% 38% 56% 56%',
                boxShadow: '0 0 22px rgba(210,148,16,0.65), 0 0 55px rgba(210,148,16,0.18)',
                animation: 'nl-drop 1.05s 0.08s ease-in-out forwards',
                opacity: 0,
              }} />
            </div>

            {/* Brand */}
            <h1 style={{
              fontFamily: 'Garamond, "Cormorant Garamond", "EB Garamond", Georgia, serif',
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: 'clamp(1.9rem, 6vw, 2.75rem)',
              color: '#f0c44a',
              letterSpacing: '0.03em',
              lineHeight: 1,
              textShadow: '0 0 44px rgba(224,158,18,0.38)',
              animation: 'nl-name 0.9s 0.65s ease-out both',
            }}>
              Purity Foods
            </h1>
            <p style={{
              marginTop: 10,
              fontSize: '0.58rem',
              color: '#7a5c22',
              textTransform: 'uppercase',
              animation: 'nl-sub 0.7s 1.1s ease-out both',
              opacity: 0,
            }}>
              Cold · Pressed · Pure
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </LoadingContext.Provider>
  );
}
