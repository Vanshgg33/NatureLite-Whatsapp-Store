'use client';

const ITEMS = [
  { icon: true,  text: 'Order on WhatsApp — fast, personal & delivered fresh' },
  { icon: false, text: 'Cold-pressed · Bilona-churned · Ship anywhere in India' },
  { icon: true,  text: 'Chat to order: +91 88172 00740 · Same-day dispatch' },
  { icon: false, text: 'Zero preservatives · 100% natural · Straight from the farm' },
  { icon: true,  text: 'Bulk orders welcome · WhatsApp us for best price' },
  { icon: false, text: 'A2 Bilona Ghee & Wood-Pressed Oils — just a message away' },
];

function WaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      style={{ display: 'inline', flexShrink: 0, marginBottom: -1 }}>
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="rgba(37,211,102,0.92)"
      />
      <path
        d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z"
        fill="rgba(37,211,102,0.92)"
      />
    </svg>
  );
}

export default function WhatsAppStrip() {
  const repeated = [...ITEMS, ...ITEMS, ...ITEMS];

  return (
    <a
      href="https://wa.me/918817200740?text=Hi%2C%20I%27d%20like%20to%20place%20an%20order"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        background: 'linear-gradient(90deg, #060e04 0%, #0a1906 50%, #060e04 100%)',
        borderBottom: '1px solid rgba(180,138,20,0.18)',
        overflow: 'hidden',
        height: 36,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 10,
        cursor: 'pointer',
        textDecoration: 'none',
        transition: 'filter 0.18s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.22)')}
      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wa-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
        .wa-ticker-track {
          display: flex;
          align-items: center;
          white-space: nowrap;
          animation: wa-ticker 32s linear infinite;
          will-change: transform;
        }
        .wa-ticker-track:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* Left fade */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 60, zIndex: 2,
        background: 'linear-gradient(90deg, #060e04 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />
      {/* Right fade */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 60, zIndex: 2,
        background: 'linear-gradient(270deg, #060e04 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      <div className="wa-ticker-track">
        {repeated.map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 28px',
          }}>
            {item.icon && <WaIcon />}
            <span style={{
              fontFamily: item.icon
                ? '"Playfair Display", Georgia, serif'
                : 'monospace',
              fontSize: item.icon ? 12 : 10.5,
              fontStyle: item.icon ? 'italic' : 'normal',
              letterSpacing: item.icon ? '0.01em' : '0.09em',
              color: item.icon
                ? 'rgba(245,228,195,0.90)'
                : 'rgba(196,150,10,0.72)',
            }}>
              {item.text}
            </span>
            <span style={{ color: 'rgba(196,150,10,0.35)', fontSize: 8, padding: '0 4px' }}>✦</span>
          </span>
        ))}
      </div>
    </a>
  );
}
