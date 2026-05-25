'use client';

import { useState } from 'react';
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
  const [open,    setOpen]    = useState(false);
  const [pincode, setPincode] = useState('');
  const [result,  setResult]  = useState<{ delivers: boolean; city?: string } | null>(null);

  const handleCheck = () => {
    if (pincode.length !== 6) return;
    setResult(checkPin(pincode));
  };

  const reset = () => { setPincode(''); setResult(null); };
  const close = () => { setOpen(false); reset(); };

  return (
    <div className="fixed z-[45] hidden sm:block" style={{ top: 82, left: 16 }}>
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="pill"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-1.5 rounded-full shadow-xl"
            style={{
              background: 'rgba(6,18,4,0.88)',
              border: '1px solid rgba(100,180,30,0.28)',
              backdropFilter: 'blur(14px)',
              padding: '7px 14px 7px 11px',
              color: 'rgba(150,225,50,0.85)',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.03em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <MapPin size={12} style={{ flexShrink: 0 }} />
            Check Delivery
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0,   scale: 1    }}
            exit={{ opacity: 0, y: -10, scale: 0.94 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 252,
              background: 'rgba(6,16,4,0.94)',
              border: '1px solid rgba(100,180,30,0.22)',
              borderRadius: 18,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 40px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(100,180,30,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <MapPin size={13} style={{ color: 'rgba(130,210,40,0.82)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(220,250,180,0.92)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Delivery Check
                </span>
              </div>
              <button onClick={close} style={{ color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                <X size={13} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(100,180,30,0.12)', margin: '0 14px' }} />

            {/* Body */}
            <div style={{ padding: '10px 14px 14px' }}>
              <AnimatePresence mode="wait">
                {!result ? (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p style={{ fontSize: 10.5, color: 'rgba(180,230,110,0.52)', marginBottom: 10, lineHeight: 1.55 }}>
                      Enter your 6-digit pincode to check if we deliver to your area.
                    </p>
                    <div style={{ display: 'flex', gap: 7 }}>
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
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(100,180,30,0.25)',
                          borderRadius: 10,
                          padding: '7px 10px',
                          fontSize: 13,
                          color: 'rgba(230,255,200,0.90)',
                          outline: 'none',
                          letterSpacing: '0.10em',
                          fontFamily: 'monospace',
                        }}
                      />
                      <button
                        onClick={handleCheck}
                        disabled={pincode.length !== 6}
                        style={{
                          background: pincode.length === 6 ? '#1a5210' : 'rgba(26,82,16,0.28)',
                          color: pincode.length === 6 ? '#fff' : 'rgba(255,255,255,0.30)',
                          border: 'none',
                          borderRadius: 10,
                          padding: '0 11px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: pincode.length === 6 ? 'pointer' : 'default',
                          transition: 'all 0.15s',
                          lineHeight: 0,
                        }}
                      >
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    {result.delivers ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <CheckCircle size={17} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80', marginBottom: 3 }}>
                            We deliver to {result.city}!
                          </p>
                          <p style={{ fontSize: 10.5, color: 'rgba(180,240,120,0.55)', lineHeight: 1.55 }}>
                            Free shipping on orders ₹499+.{' '}
                            Same-day dispatch available.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <XCircle size={17} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#f87171', marginBottom: 3 }}>
                            Not in our area yet.
                          </p>
                          <p style={{ fontSize: 10.5, color: 'rgba(180,230,120,0.50)', lineHeight: 1.55 }}>
                            Delivering to Raipur · Bhilai · Durg · Bilaspur (CG).
                          </p>
                        </div>
                      </div>
                    )}
                    <button onClick={reset} style={{
                      marginTop: 10, fontSize: 10.5, color: 'rgba(130,210,40,0.65)',
                      textDecoration: 'underline', background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0,
                    }}>
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
