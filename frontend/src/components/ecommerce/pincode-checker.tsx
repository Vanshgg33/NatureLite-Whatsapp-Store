'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MapPin, X, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DELIVERY_ZONES: { prefix: string; city: string }[] = [
  { prefix: '492', city: 'Raipur'   },
  { prefix: '490', city: 'Bhilai'   },
  { prefix: '491', city: 'Durg'     },
  { prefix: '495', city: 'Bilaspur' },
];

function checkPin(pin: string): { delivers: boolean; city?: string } {
  const zone = DELIVERY_ZONES.find(z => pin.startsWith(z.prefix));
  return zone ? { delivers: true, city: zone.city } : { delivers: false };
}

export function PincodeChecker() {
  const pathname = usePathname();
  const [open,    setOpen]    = useState(false);
  const [pincode, setPincode] = useState('');
  const [result,  setResult]  = useState<{ delivers: boolean; city?: string } | null>(null);

  // Hide on account pages — sidebar occupies the left edge where this button sits
  if (pathname.startsWith('/account')) return null;

  const handleCheck = () => {
    if (pincode.length !== 6) return;
    setResult(checkPin(pincode));
  };

  const reset = () => { setPincode(''); setResult(null); };
  const close = () => { setOpen(false); reset(); };

  return (
    <div className="fixed z-[60]" style={{ top: 120, left: 16 }}>
      <AnimatePresence mode="wait">

        {/* ── Pill button ───────────────────────────────────────── */}
        {!open ? (
          <motion.button
            key="pill"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex items-center gap-2 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(10,26,6,0.95) 0%, rgba(18,42,10,0.95) 100%)',
              border: '1px solid rgba(120,200,50,0.35)',
              backdropFilter: 'blur(16px)',
              padding: '10px 18px 10px 14px',
              color: 'rgba(160,235,70,0.92)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 24px -4px rgba(0,0,0,0.55), 0 0 0 1px rgba(100,180,30,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Pulse ring */}
            <span
              className="absolute inset-0 rounded-full"
              style={{
                border: '1.5px solid rgba(120,200,50,0.30)',
                animation: 'ping 2.4s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
            <MapPin size={15} style={{ flexShrink: 0, color: 'rgba(140,220,60,0.90)' }} />
            Check Delivery
          </motion.button>
        ) : (

        /* ── Expanded panel ───────────────────────────────────── */
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 296,
              background: 'linear-gradient(160deg, rgba(8,20,4,0.97) 0%, rgba(14,32,8,0.97) 100%)',
              border: '1px solid rgba(100,180,30,0.22)',
              borderRadius: 20,
              backdropFilter: 'blur(24px)',
              boxShadow: '0 16px 48px -8px rgba(0,0,0,0.70), 0 0 0 1px rgba(100,180,30,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '15px 16px 12px',
              borderBottom: '1px solid rgba(100,180,30,0.10)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(100,180,30,0.12)',
                  border: '1px solid rgba(100,180,30,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MapPin size={15} style={{ color: 'rgba(140,220,60,0.88)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'rgba(220,255,170,0.95)', lineHeight: 1.2 }}>
                    Check Delivery
                  </p>
                  <p style={{ fontSize: 10, color: 'rgba(140,210,60,0.45)', letterSpacing: '0.04em', marginTop: 1 }}>
                    Enter your pincode below
                  </p>
                </div>
              </div>
              <button
                onClick={close}
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.40)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '14px 16px 16px' }}>
              <AnimatePresence mode="wait">

                {/* Input state */}
                {!result ? (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <p style={{ fontSize: 11.5, color: 'rgba(160,230,90,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
                      Enter your 6-digit pincode to check if we deliver to your area.
                    </p>

                    {/* Input row */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={pincode}
                        autoFocus
                        placeholder="e.g. 492001"
                        onChange={e => { setPincode(e.target.value.replace(/\D/g, '')); setResult(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleCheck()}
                        style={{
                          flex: 1,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(100,180,30,0.28)',
                          borderRadius: 12,
                          padding: '10px 13px',
                          fontSize: 15,
                          color: 'rgba(220,255,180,0.92)',
                          outline: 'none',
                          letterSpacing: '0.14em',
                          fontFamily: 'monospace',
                          caretColor: 'rgba(140,220,60,0.80)',
                        }}
                      />
                      <button
                        onClick={handleCheck}
                        disabled={pincode.length !== 6}
                        style={{
                          width: 44,
                          background: pincode.length === 6
                            ? 'linear-gradient(135deg,#22640e,#1a5210)'
                            : 'rgba(26,82,16,0.20)',
                          color: pincode.length === 6 ? '#fff' : 'rgba(255,255,255,0.25)',
                          border: pincode.length === 6
                            ? '1px solid rgba(80,160,30,0.40)'
                            : '1px solid rgba(80,160,30,0.10)',
                          borderRadius: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: pincode.length === 6 ? 'pointer' : 'default',
                          transition: 'all 0.18s ease',
                          flexShrink: 0,
                          boxShadow: pincode.length === 6 ? '0 4px 16px -4px rgba(34,100,14,0.55)' : 'none',
                        }}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>

                    {/* Serviceable cities chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {DELIVERY_ZONES.map(z => (
                        <span
                          key={z.prefix}
                          style={{
                            fontSize: 10.5,
                            padding: '3px 9px',
                            borderRadius: 20,
                            background: 'rgba(100,180,30,0.08)',
                            border: '1px solid rgba(100,180,30,0.15)',
                            color: 'rgba(160,230,80,0.60)',
                          }}
                        >
                          {z.city}
                        </span>
                      ))}
                    </div>
                  </motion.div>

                ) : (

                  /* Result state */
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    {result.delivers ? (
                      <div style={{
                        background: 'rgba(34,197,94,0.07)',
                        border: '1px solid rgba(34,197,94,0.18)',
                        borderRadius: 14,
                        padding: '14px',
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                        marginBottom: 12,
                      }}>
                        <CheckCircle size={20} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#4ade80', marginBottom: 4, lineHeight: 1.2 }}>
                            We deliver to {result.city}!
                          </p>
                          <p style={{ fontSize: 11, color: 'rgba(160,240,110,0.55)', lineHeight: 1.6 }}>
                            Free shipping on orders ₹499+.
                            <br />Same-day dispatch available.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(248,113,113,0.07)',
                        border: '1px solid rgba(248,113,113,0.18)',
                        borderRadius: 14,
                        padding: '14px',
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                        marginBottom: 12,
                      }}>
                        <XCircle size={20} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#f87171', marginBottom: 4, lineHeight: 1.2 }}>
                            Not in our delivery area yet.
                          </p>
                          <p style={{ fontSize: 11, color: 'rgba(200,160,160,0.50)', lineHeight: 1.6 }}>
                            We currently serve Raipur, Bhilai, Durg &amp; Bilaspur (CG).
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={reset}
                      style={{
                        fontSize: 11.5,
                        color: 'rgba(130,210,40,0.65)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      Try another pincode
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
