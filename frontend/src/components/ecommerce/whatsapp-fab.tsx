'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

function WaIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="#fff"
      />
      <path
        d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z"
        fill="#fff"
      />
    </svg>
  );
}

const WA_URL = 'https://wa.me/918817200740?text=Hi%2C%20I%27d%20like%20to%20place%20an%20order';

export function WhatsAppFab() {
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="fixed z-[44] bottom-[90px] sm:bottom-7 wa-fab-bob"
      style={{ right: 20 }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* Label tooltip */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, x: 10, scale: 0.92 }}
              animate={{ opacity: 1, x: 0,  scale: 1    }}
              exit={{ opacity: 0, x: 10, scale: 0.92 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute',
                right: 58,
                background: '#075e54',
                color: '#fff',
                borderRadius: 10,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 18px -3px rgba(7,94,84,0.55)',
                pointerEvents: 'none',
              }}
            >
              Order on WhatsApp
              {/* Arrow */}
              <span style={{
                position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)',
                width: 0, height: 0,
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderLeft: '6px solid #075e54',
              }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB */}
        <div style={{ position: 'relative' }}>
          {/* Dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: 'absolute', top: -6, right: -6, zIndex: 1,
              width: 18, height: 18, borderRadius: '50%',
              background: 'rgba(30,30,30,0.80)',
              border: '1.5px solid rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.70)',
            }}
            aria-label="Dismiss WhatsApp button"
          >
            <X size={9} />
          </button>

          {/* Pulse ring */}
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(37,211,102,0.35)',
              animation: 'wa-fab-pulse 2.4s ease-out infinite',
            }}
          />

          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            aria-label="Order on WhatsApp"
            className="wa-fab-link"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
              boxShadow: '0 4px 20px -3px rgba(37,211,102,0.60)',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
          >
            <WaIcon size={26} />
          </a>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wa-fab-pulse {
          0%   { transform: scale(1);    opacity: 0.70; }
          70%  { transform: scale(1.65); opacity: 0; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        @keyframes wa-fab-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .wa-fab-bob { animation: wa-fab-bob 3.2s ease-in-out infinite; }
        .wa-fab-link:hover { transform: scale(1.10); }
      `}} />
    </div>
  );
}
