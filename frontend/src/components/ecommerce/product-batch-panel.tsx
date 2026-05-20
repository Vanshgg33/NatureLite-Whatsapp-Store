'use client';

import { motion } from 'framer-motion';

const G = '#0b1c08';
const GOLD = '#a07010';
const GOLD_LIGHT = 'rgba(160,112,16,0.12)';
const BORDER = 'rgba(26,82,16,0.13)';
const TEXT_DIM = 'rgba(13,44,7,0.52)';

interface BatchInfo {
  batchNumber?: string;
  batchDate?: string;
  yieldKg?: number;
  milkLitres?: number;
  origin?: string;
  nextBatchDays?: number;
  purityClaims?: string[];
}

// ─── Batch Story Card ──────────────────────────────────────────────────────────

export function BatchStoryCard({ info }: { info: BatchInfo }) {
  const date = info.batchDate
    ? new Date(info.batchDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const fields = [
    info.batchNumber && { label: 'Batch', value: `#${info.batchNumber}` },
    date             && { label: 'Churned on', value: date },
    (info.yieldKg && info.milkLitres)
      && { label: 'Yield', value: `${info.yieldKg} kg from ${info.milkLitres} L milk` },
    info.origin      && { label: 'Origin', value: info.origin },
  ].filter(Boolean) as { label: string; value: string }[];

  if (fields.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      style={{
        background: 'rgba(255,252,245,0.85)',
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/* handwritten scroll icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="2" stroke={GOLD} strokeWidth="1.2" fill="none"/>
          <line x1="5" y1="5" x2="9" y2="5" stroke={GOLD} strokeWidth="1" strokeLinecap="round"/>
          <line x1="5" y1="7.5" x2="9" y2="7.5" stroke={GOLD} strokeWidth="1" strokeLinecap="round"/>
          <line x1="5" y1="10" x2="7.5" y2="10" stroke={GOLD} strokeWidth="1" strokeLinecap="round"/>
          <circle cx="13" cy="13" r="2.5" fill={GOLD} opacity="0.18"/>
        </svg>
        <span style={{
          fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: GOLD,
        }}>
          Batch Record
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontFamily: 'monospace', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEXT_DIM, marginBottom: 2 }}>
              {label}
            </p>
            <p style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 13, fontWeight: 600, color: G, letterSpacing: '-0.01em' }}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Purity Meter ──────────────────────────────────────────────────────────────

export function PurityMeter({ claims }: { claims: string[] }) {
  if (!claims || claims.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.18 }}
      style={{
        background: 'rgba(255,252,245,0.85)',
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {/* dial icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2.5 11 A6 6 0 1 1 13.5 11" stroke={GOLD} strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          <line x1="8" y1="11" x2="8" y2="5.5" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="1.3" fill={GOLD}/>
        </svg>
        <span style={{
          fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: GOLD,
        }}>
          Purity Promise
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {claims.map((claim) => (
          <div
            key={claim}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: GOLD_LIGHT,
              border: `1px solid rgba(160,112,16,0.22)`,
              borderRadius: 999,
              padding: '4px 10px',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3.5" fill="none" stroke={GOLD} strokeWidth="1"/>
              <path d="M2.5 4L3.5 5L5.5 3" stroke={GOLD} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span style={{
              fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em',
              color: '#5a3c00', fontWeight: 600,
            }}>
              {claim}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Stock Context Banner ──────────────────────────────────────────────────────

export function StockContextBanner({
  stock,
  threshold,
  nextBatchDays,
  batchNumber,
}: {
  stock: number;
  threshold: number;
  nextBatchDays?: number;
  batchNumber?: string;
}) {
  if (stock <= 0) return null;
  const isLow = stock <= threshold;
  if (!isLow && !batchNumber) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: isLow ? 'rgba(184,92,56,0.06)' : 'rgba(26,82,16,0.05)',
        border: `1px solid ${isLow ? 'rgba(184,92,56,0.20)' : 'rgba(26,82,16,0.14)'}`,
        borderRadius: 12,
        padding: '10px 14px',
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>
        {isLow ? '⚡' : '🌿'}
      </span>
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: isLow ? '#b85c38' : G, marginBottom: 2 }}>
          {isLow
            ? `Only ${stock} jar${stock !== 1 ? 's' : ''} left from this batch`
            : `${stock} jar${stock !== 1 ? 's' : ''} available from this batch`}
          {batchNumber ? ` · Batch #${batchNumber}` : ''}
        </p>
        {nextBatchDays !== undefined && nextBatchDays > 0 && (
          <p style={{ fontSize: 11, color: TEXT_DIM }}>
            Next batch ready in ~{nextBatchDays} day{nextBatchDays !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </motion.div>
  );
}
