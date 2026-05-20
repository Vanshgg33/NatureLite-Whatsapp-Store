'use client';

import { useEffect, useRef } from 'react';

/* ── CSS keyframes injected once ─────────────────────────────────────────── */
const STYLES = `
  @keyframes nl-bg-churn {
    0%   { transform: rotate(-18deg); }
    100% { transform: rotate(18deg); }
  }
  @keyframes nl-bg-rope-l {
    0%   { transform: rotate(18deg); }
    100% { transform: rotate(-18deg); }
  }
  @keyframes nl-bg-rope-r {
    0%   { transform: rotate(-18deg); }
    100% { transform: rotate(18deg); }
  }
  @keyframes nl-bg-ripple {
    0%   { transform: scale(0.5); opacity: 0.6; }
    100% { transform: scale(2.8); opacity: 0; }
  }
  @keyframes nl-bg-butter {
    0%   { transform: translateY(0px);   opacity: 0.7; }
    100% { transform: translateY(-40px); opacity: 0; }
  }
  @keyframes nl-bg-steam {
    0%   { transform: translateY(0px)   scaleX(1);    opacity: 0.5; }
    100% { transform: translateY(-28px) scaleX(1.5);  opacity: 0; }
  }
  @keyframes nl-bg-flame-a {
    0%,100% { transform: scaleY(1)    scaleX(1);    }
    40%     { transform: scaleY(1.12) scaleX(0.90); }
    70%     { transform: scaleY(0.92) scaleX(1.08); }
  }
  @keyframes nl-bg-flame-b {
    0%,100% { transform: scaleY(1)    scaleX(1);   opacity: 0.9; }
    50%     { transform: scaleY(1.18) scaleX(0.88); opacity: 1; }
  }
  @keyframes nl-bg-fill {
    0%   { transform: translateY(32px); opacity: 0; }
    100% { transform: translateY(0px);  opacity: 1; }
  }
  @keyframes nl-bg-bubble {
    0%,100% { transform: translateY(0px);  opacity: 0.4; }
    50%     { transform: translateY(-6px); opacity: 0.8; }
  }
  @keyframes nl-bg-seed-float {
    0%   { transform: translateY(0px)  translateX(0px)  rotate(0deg);   opacity: 0.55; }
    100% { transform: translateY(-80px) translateX(12px) rotate(180deg); opacity: 0; }
  }
  @keyframes nl-bg-glow-pulse {
    0%,100% { opacity: 0.80; }
    50%     { opacity: 1; }
  }
`;

/* ── Seed particle canvas ─────────────────────────────────────────────────── */
function SeedCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const seeds: {
      x: number; y: number; vx: number; vy: number;
      size: number; angle: number; spin: number; alpha: number; oval: boolean;
    }[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function makeSeed(randomY = false) {
      return {
        x:     Math.random() * (canvas?.width  ?? 800),
        y:     randomY ? Math.random() * (canvas?.height ?? 600) : (canvas?.height ?? 600) + 20,
        vx:    (Math.random() - 0.5) * 0.4,
        vy:    -(Math.random() * 0.5 + 0.2),
        size:  Math.random() * 3.5 + 1.5,
        angle: Math.random() * Math.PI * 2,
        spin:  (Math.random() - 0.5) * 0.018,
        alpha: Math.random() * 0.30 + 0.08,
        oval:  Math.random() > 0.5,
      };
    }

    for (let i = 0; i < 55; i++) seeds.push(makeSeed(true));

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      seeds.forEach((s) => {
        s.x += s.vx + Math.sin(Date.now() * 0.0006 + s.y * 0.008) * 0.25;
        s.y += s.vy;
        s.angle += s.spin;
        if (s.y < -24) Object.assign(s, makeSeed(false));

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.globalAlpha = s.alpha;
        if (s.oval) {
          ctx.beginPath();
          ctx.ellipse(0, 0, s.size * 1.3, s.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(215,160,65,1)`;
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -s.size * 1.4);
          ctx.bezierCurveTo(s.size * 0.9, -s.size * 0.7, s.size * 0.9, s.size * 0.7, 0, s.size * 1.4);
          ctx.bezierCurveTo(-s.size * 0.9, s.size * 0.7, -s.size * 0.9, -s.size * 0.7, 0, -s.size * 1.4);
          ctx.fillStyle = `rgba(185,120,30,1)`;
        }
        ctx.fill();
        ctx.restore();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
    />
  );
}

/* ── Hero: large bilona churning scene ───────────────────────────────────── */
function LargeChurnScene() {
  const churnStyle: React.CSSProperties = {
    animation: 'nl-bg-churn 1.4s ease-in-out infinite alternate',
    transformOrigin: '100px 160px',
  };
  return (
    <svg viewBox="0 0 200 260" width="340" height="442"
      style={{ overflow: 'visible' }} aria-hidden>

      {/* Ropes */}
      <g style={{ animation: 'nl-bg-rope-l 1.4s ease-in-out infinite alternate', transformOrigin: '88px 110px' }}>
        <path d="M88,102 C60,102 18,78 4,68"
          stroke="rgba(196,154,96,0.55)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ animation: 'nl-bg-rope-r 1.4s ease-in-out infinite alternate', transformOrigin: '112px 110px' }}>
        <path d="M112,102 C140,102 182,78 196,68"
          stroke="rgba(196,154,96,0.55)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>

      {/* Pot body */}
      <path d="M22,148 Q10,185 22,210 Q42,232 100,232 Q158,232 178,210 Q190,185 178,148 Z"
        fill="rgba(176,104,48,0.70)" />
      {/* Pot highlight */}
      <path d="M22,148 Q16,178 24,202"
        stroke="rgba(220,160,80,0.28)" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Pot mouth */}
      <ellipse cx="100" cy="148" rx="78" ry="22" fill="rgba(139,72,32,0.65)" />
      <ellipse cx="100" cy="145" rx="74" ry="19" fill="rgba(160,88,48,0.60)" />

      {/* Curd surface */}
      <ellipse cx="100" cy="153" rx="70" ry="16" fill="rgba(237,232,210,0.45)" />

      {/* Ripple rings */}
      {[0, 1, 2].map(i => (
        <ellipse key={i} cx="100" cy="153" rx="22" ry="7" fill="none"
          stroke="rgba(210,200,170,0.35)" strokeWidth="1.2"
          style={{
            animation: `nl-bg-ripple 2.2s ease-out infinite ${i * 0.65}s`,
            transformOrigin: '100px 153px',
          }}
        />
      ))}

      {/* Butter globules */}
      {[{ cx: 72, cy: 150, r: 7, d: 0 }, { cx: 120, cy: 152, r: 5.5, d: 0.8 }, { cx: 90, cy: 149, r: 4.5, d: 1.4 }].map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r}
          fill="rgba(255,252,230,0.55)"
          style={{ animation: `nl-bg-butter 2.8s ease-in infinite ${b.d}s` }}
        />
      ))}

      {/* Wooden stick */}
      <g style={churnStyle}>
        <rect x="93.5" y="14" width="13" height="190" rx="6.5" fill="rgba(107,48,16,0.70)" />
        <rect x="97"   y="16" width="7"  height="186" rx="3.5" fill="rgba(139,72,32,0.55)" />
        {[65, 85, 105, 125].map(y => (
          <line key={y} x1="88" y1={y} x2="112" y2={y}
            stroke="rgba(196,154,96,0.45)" strokeWidth="2" strokeLinecap="round" />
        ))}
        <circle cx="100" cy="20" r="10" fill="rgba(74,32,8,0.70)" />
        <circle cx="100" cy="18" r="8"  fill="rgba(107,48,16,0.55)" />
      </g>

      {/* Pot shadow */}
      <ellipse cx="100" cy="238" rx="72" ry="10" fill="rgba(0,0,0,0.20)" />
    </svg>
  );
}

/* ── Left: milk lota ─────────────────────────────────────────────────────── */
function SmallMilkScene() {
  return (
    <svg viewBox="0 0 100 120" width="130" height="156" aria-hidden>
      {/* Shadow */}
      <ellipse cx="50" cy="116" rx="28" ry="5" fill="rgba(0,0,0,0.15)" />
      {/* Lota body */}
      <path d="M26,92 Q20,105 28,112 Q38,120 50,120 Q62,120 72,112 Q80,105 74,92 Z"
        fill="rgba(200,152,64,0.55)" />
      <rect x="36" y="72" width="28" height="22" rx="5" fill="rgba(184,136,48,0.50)" />
      <ellipse cx="50" cy="92" rx="25" ry="7" fill="rgba(200,152,64,0.50)" />
      <ellipse cx="50" cy="72" rx="16" ry="5.5" fill="rgba(212,164,80,0.50)" />
      <ellipse cx="50" cy="71" rx="14" ry="4"   fill="rgba(184,136,48,0.45)" />
      {/* Milk */}
      <ellipse cx="50" cy="73" rx="12" ry="3.5"
        fill="rgba(255,252,240,0.55)"
        style={{ animation: 'nl-bg-fill 1s cubic-bezier(.22,1,.36,1) both' }}
      />
      {/* Steam */}
      {[0, 1, 2].map(i => (
        <path key={i}
          d={`M${44 + i * 5},67 Q${42 + i * 6},59 ${45 + i * 4},52`}
          stroke="rgba(255,252,240,0.30)" strokeWidth="1.5" fill="none" strokeLinecap="round"
          style={{ animation: `nl-bg-steam 2s ease-out infinite ${i * 0.55}s` }}
        />
      ))}
      <path d="M30,94 Q28,104 31,110" stroke="rgba(255,210,100,0.22)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── Right: ghee jar + flame ─────────────────────────────────────────────── */
function SmallGheeScene() {
  return (
    <svg viewBox="0 0 100 130" width="130" height="169" aria-hidden>
      <defs>
        <linearGradient id="nlBgGheeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(255,208,96,0.70)">
            <animate attributeName="stop-color"
              values="rgba(255,208,96,0.70);rgba(255,160,32,0.70);rgba(255,208,96,0.70)"
              dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="rgba(160,96,16,0.70)" />
        </linearGradient>
        <clipPath id="nlBgJarClip"><rect x="22" y="42" width="56" height="62" rx="8" /></clipPath>
      </defs>

      {/* Shadow */}
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.15)" />

      {/* Flame */}
      <g style={{ transformOrigin: '50px 108px' }}>
        <path d="M38,112 Q40,100 50,96 Q60,100 62,112 Z"
          fill="rgba(255,140,0,0.60)"
          style={{ animation: 'nl-bg-flame-a 0.85s ease-in-out infinite', transformOrigin: '50px 104px' }}
        />
        <path d="M42,112 Q44,103 50,100 Q56,103 58,112 Z"
          fill="rgba(255,200,50,0.65)"
          style={{ animation: 'nl-bg-flame-b 0.70s ease-in-out infinite 0.15s', transformOrigin: '50px 106px' }}
        />
        <path d="M46,112 Q48,107 50,104 Q52,107 54,112 Z"
          fill="rgba(255,240,180,0.75)"
          style={{ animation: 'nl-bg-flame-a 0.60s ease-in-out infinite 0.08s', transformOrigin: '50px 108px' }}
        />
        <ellipse cx="50" cy="112" rx="14" ry="2.5" fill="rgba(255,120,0,0.25)" />
      </g>

      {/* Jar */}
      <rect x="22" y="42" width="56" height="62" rx="8"
        fill="rgba(60,28,4,0.18)" stroke="rgba(184,138,20,0.22)" strokeWidth="1.2" />
      <g clipPath="url(#nlBgJarClip)">
        <rect x="22" y="42" width="56" height="62"
          fill="url(#nlBgGheeGrad)"
          style={{ animation: 'nl-bg-fill 1.4s cubic-bezier(.22,1,.36,1) 0.4s both' }}
        />
      </g>
      <rect x="25" y="45" width="8" height="54" rx="4" fill="rgba(255,210,100,0.10)" />
      {/* Lid */}
      <rect x="18" y="30" width="64" height="14" rx="5" fill="rgba(90,46,16,0.55)" />
      <rect x="22" y="32" width="56" height="9"  rx="3" fill="rgba(122,62,24,0.50)" />

      {/* Shadow */}
      <ellipse cx="50" cy="108" rx="32" ry="4.5" fill="rgba(0,0,0,0.15)" />
    </svg>
  );
}

/* ── Curd earthen pot (top-right accent) ─────────────────────────────────── */
function SmallCurdScene() {
  return (
    <svg viewBox="0 0 80 90" width="110" height="124" aria-hidden>
      <ellipse cx="40" cy="87" rx="24" ry="4" fill="rgba(0,0,0,0.14)" />
      <path d="M10,48 Q5,65 12,76 Q22,86 40,86 Q58,86 68,76 Q75,65 70,48 Z"
        fill="rgba(176,104,48,0.50)" />
      <ellipse cx="40" cy="48" rx="30" ry="9" fill="rgba(139,72,32,0.48)" />
      <ellipse cx="40" cy="46" rx="28" ry="7.5" fill="rgba(160,88,48,0.44)" />
      {/* Curd */}
      <ellipse cx="40" cy="51" rx="26" ry="6"
        fill="rgba(237,232,210,0.38)"
        style={{ animation: 'nl-bg-fill 1s cubic-bezier(.22,1,.36,1) 0.2s both' }}
      />
      {[0, 1, 2].map(i => (
        <circle key={i} cx={28 + i * 8} cy={51} r={1.5}
          fill="rgba(200,185,150,0.40)"
          style={{ animation: `nl-bg-bubble ${1.8 + i * 0.4}s ease-in-out infinite ${i * 0.55}s` }}
        />
      ))}
    </svg>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export default function BilonaBackground() {
  return (
    <>
      <style>{STYLES}</style>

      {/* Seed canvas */}
      <SeedCanvas />

      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          opacity: 0.45, mixBlendMode: 'overlay',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.80' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Ambient gold glow — top center */}
      <div aria-hidden style={{
        position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
        width: 700, height: 500, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(160,112,16,0.12) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none',
        animation: 'nl-bg-glow-pulse 4s ease-in-out infinite',
      }} />

      {/* Ambient green glow — bottom */}
      <div aria-hidden style={{
        position: 'absolute', bottom: '-10%', left: '30%',
        width: 500, height: 400, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(26,82,16,0.18) 0%, transparent 70%)',
        filter: 'blur(70px)', pointerEvents: 'none',
      }} />

      {/* Large Devanagari watermark */}
      <div aria-hidden style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: "'Noto Sans Devanagari', serif",
        fontSize: 'clamp(80px, 18vw, 240px)',
        fontWeight: 900, color: 'rgba(184,138,20,0.025)',
        whiteSpace: 'nowrap', pointerEvents: 'none',
        userSelect: 'none', letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        बिलोना
      </div>

      {/* ── Positioned SVG scenes ── */}

      {/* Top-left: milk lota */}
      <div aria-hidden style={{
        position: 'absolute', top: '8%', left: '3%',
        opacity: 0.50, pointerEvents: 'none',
        transform: 'rotate(-8deg)',
      }}>
        <SmallMilkScene />
      </div>

      {/* Top-right: curd pot */}
      <div aria-hidden style={{
        position: 'absolute', top: '4%', right: '4%',
        opacity: 0.42, pointerEvents: 'none',
        transform: 'rotate(6deg)',
      }}>
        <SmallCurdScene />
      </div>

      {/* CENTER-LEFT: the hero churning scene */}
      <div aria-hidden style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.13, pointerEvents: 'none',
      }}>
        <LargeChurnScene />
      </div>

      {/* Bottom-left: another curd pot (mirrored) */}
      <div aria-hidden style={{
        position: 'absolute', bottom: '5%', left: '5%',
        opacity: 0.38, pointerEvents: 'none',
        transform: 'rotate(4deg) scale(0.85)',
      }}>
        <SmallCurdScene />
      </div>

      {/* Bottom-right: ghee jar + flame */}
      <div aria-hidden style={{
        position: 'absolute', bottom: '6%', right: '3%',
        opacity: 0.48, pointerEvents: 'none',
        transform: 'rotate(-5deg)',
      }}>
        <SmallGheeScene />
      </div>

      {/* Step label strip at bottom */}
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        gap: 'clamp(16px, 4vw, 48px)',
        padding: '14px 24px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(4,14,2,0.55)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}>
        {['A2 Milk', 'Curdling', 'Bilona Churning', 'Butter', 'Pure Ghee'].map((label, i) => (
          <span key={label} style={{
            fontFamily: 'monospace', fontSize: 10,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: i === 2 ? 'rgba(184,138,20,0.75)' : 'rgba(255,255,255,0.28)',
            fontWeight: i === 2 ? 700 : 400,
          }}>
            {i === 2 ? '★ ' : ''}{label}
          </span>
        ))}
      </div>
    </>
  );
}
