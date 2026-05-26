'use client';

interface MarqueeTickerProps {
  items: { icon: string; text: string }[];
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MarqueeTicker({ items, speed = 40, className, style }: MarqueeTickerProps) {
  // duration in seconds = total approximate pixel width / speed
  // we duplicate the list so the loop is seamless
  const duration = (items.length * 160) / speed;

  const row = [...items, ...items];

  return (
    <div className={`overflow-hidden ${className ?? ''}`} style={style}>
      <div
        style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          animation: `nl-marquee ${duration}s linear infinite`,
          willChange: 'transform',
        }}
      >
        {row.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 32px',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            {item.text}
            <span style={{ marginLeft: 16, opacity: 0.3 }}>·</span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes nl-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="nl-marquee"] { animation: none; }
        }
      `}</style>
    </div>
  );
}
