'use client';

import Link from 'next/link';

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="currentColor"
      />
      <path
        d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function QuickOrderBanner() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes qob-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.55; }
          60%  { transform: scale(1.9); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes qob-shimmer {
          0%   { transform: translateX(-100%) skewX(-18deg); }
          100% { transform: translateX(260%)  skewX(-18deg); }
        }
        @keyframes qob-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        .qob-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 13px 28px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.02em;
          cursor: pointer;
          text-decoration: none;
          overflow: hidden;
          color: #fff;
          background: linear-gradient(135deg, #1a7a38 0%, #25d366 50%, #128c3e 100%);
          box-shadow:
            0 4px 20px rgba(37,211,102,0.35),
            0 1px 4px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,255,255,0.18);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: qob-float 3s ease-in-out infinite;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .qob-btn:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow:
            0 8px 32px rgba(37,211,102,0.50),
            0 2px 8px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,255,255,0.22);
          animation: none;
        }
        .qob-btn:active {
          transform: scale(0.97);
        }
        .qob-shimmer {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          animation: qob-shimmer 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        .qob-pulse {
          position: absolute;
          inset: 0;
          border-radius: 50px;
          background: rgba(37,211,102,0.40);
          animation: qob-pulse-ring 2s ease-out infinite;
          pointer-events: none;
        }
        .qob-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          background: rgba(26,140,62,0.10);
          color: #1a7a38;
          border: 1px solid rgba(26,140,62,0.22);
        }
      `}} />

      <div style={{
        background: 'linear-gradient(135deg, #f5f0e8 0%, #faf7f2 50%, #f5f0e8 100%)',
        padding: '28px 16px 26px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>

        {/* eyebrow label */}
        <div className="qob-badge">
          <span>⚡</span>
          <span>Fastest way to order</span>
        </div>

        {/* headline */}
        <p style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 'clamp(17px, 3vw, 22px)',
          fontWeight: 700,
          color: '#1a2e12',
          letterSpacing: '-0.01em',
          textAlign: 'center',
          lineHeight: 1.3,
          margin: 0,
        }}>
          Skip the cart — order in{' '}
          <span style={{ color: '#1a8c3e', fontStyle: 'italic' }}>60 seconds</span>
        </p>

        {/* button */}
        <Link href="/quick-order" className="qob-btn">
          <div className="qob-pulse" />
          <div className="qob-shimmer" />
          <WhatsAppIcon />
          <span>Quick Order on WhatsApp</span>
          <ArrowIcon />
        </Link>

        {/* sub-caption */}
        <p style={{
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: '0.12em',
          color: 'rgba(60,80,40,0.45)',
          textTransform: 'uppercase',
          margin: 0,
          textAlign: 'center',
        }}>
          Pick your products · We confirm · Delivered to your door
        </p>
      </div>
    </>
  );
}
