'use client';

import { motion, AnimatePresence } from 'framer-motion';

/* ─── Tokens ─────────────────────────────────────────────────────────────────── */
const G   = '#b88a14';
const G80 = 'rgba(184,138,20,0.80)';
const G55 = 'rgba(184,138,20,0.55)';
const G35 = 'rgba(184,138,20,0.35)';
const G15 = 'rgba(184,138,20,0.15)';
const DARK= 'rgba(4,14,2,0.92)';
const C18 = 'rgba(242,236,224,0.18)';

/* ─── Keyframes ──────────────────────────────────────────────────────────────── */
const STYLES = `
  @keyframes bld-churn {
    0%   { transform: rotate(-17deg); }
    100% { transform: rotate(17deg);  }
  }
  @keyframes bld-ripple {
    0%   { transform: scale(0.55); opacity: 0.60; }
    100% { transform: scale(2.20); opacity: 0;    }
  }
  @keyframes bld-flame {
    0%,100% { transform: scaleY(1)    skewX(0deg);  opacity: 0.65; }
    35%      { transform: scaleY(1.3)  skewX(6deg);  opacity: 0.90; }
    70%      { transform: scaleY(0.85) skewX(-5deg); opacity: 0.75; }
  }
  @keyframes bld-steam {
    0%   { transform: translateY(0px)   scaleX(1);    opacity: 0.40; }
    100% { transform: translateY(-11px) scaleX(1.45); opacity: 0;    }
  }
  @keyframes bld-drop {
    0%   { transform: translateY(0px);  opacity: 0.90; }
    65%  { transform: translateY(15px); opacity: 0.70; }
    100% { transform: translateY(22px); opacity: 0;    }
  }
  @keyframes bld-glow {
    0%,100% { opacity: 0.35; }
    50%      { opacity: 0.85; }
  }
  @keyframes bld-breathe {
    0%,100% { opacity: 0.55; }
    50%      { opacity: 0.92; }
  }
  @keyframes bld-spin-diamond {
    0%   { transform: rotate(45deg) scale(1);    }
    50%  { transform: rotate(45deg) scale(1.12); }
    100% { transform: rotate(45deg) scale(1);    }
  }
  @keyframes wpo-beam {
    0%   { transform: rotate(0deg);   }
    100% { transform: rotate(360deg); }
  }
  @keyframes wpo-oil-drop {
    0%   { transform: translateY(0px);  opacity: 0;    }
    15%  { opacity: 0.85; }
    85%  { transform: translateY(12px); opacity: 0.75; }
    100% { transform: translateY(16px); opacity: 0;    }
  }
  @keyframes wpo-ray {
    0%,100% { opacity: 0.30; transform: scaleX(1);    }
    50%      { opacity: 0.70; transform: scaleX(1.15); }
  }
`;

/* ─── Shared cap ornament ────────────────────────────────────────────────────── */
function CapOrnament({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="22" height="34" viewBox="0 0 22 34" fill="none"
      style={{ transform: flip ? 'scaleY(-1)' : undefined, flexShrink: 0 }}>
      <line x1="11" y1="0"  x2="11" y2="9"  stroke={G35} strokeWidth="1" />
      <polygon points="11,10 16,16 11,22 6,16"
        stroke={G55} strokeWidth="1" fill={G15} />
      <circle cx="11" cy="16" r="2" fill={G55} />
      <line x1="11" y1="23" x2="11" y2="34" stroke={G35} strokeWidth="1" />
    </svg>
  );
}

/* ─── Diamond connector badge ────────────────────────────────────────────────── */
function ConnectorBadge({ n, hero }: { n: string; hero?: boolean }) {
  return (
    <div style={{
      width: 20, height: 20,
      transform: 'rotate(45deg)',
      border: `1px solid ${hero ? G80 : G35}`,
      background: DARK,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      animation: hero ? 'bld-spin-diamond 3s ease-in-out infinite' : undefined,
    }}>
      <span style={{
        transform: 'rotate(-45deg)',
        fontSize: 7, fontFamily: 'monospace',
        color: hero ? G : G55,
        lineHeight: 1, fontWeight: hero ? 700 : 400,
        userSelect: 'none',
      }}>{n}</span>
    </div>
  );
}

/* ─── Connector: line + midpoint badge ──────────────────────────────────────── */
function Connector({ stepNum, hero = false }: { stepNum: string; hero?: boolean }) {
  const grad = hero
    ? `linear-gradient(to bottom, ${G35}, ${G80}, ${G})`
    : `linear-gradient(to bottom, ${G35}, ${G55})`;
  return (
    <motion.div
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      exit={{ scaleY: 0, opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transformOrigin: 'top', flexShrink: 0 }}
    >
      <div style={{ width: 1, height: 10, background: grad }} />
      <ConnectorBadge n={stepNum} hero={hero} />
      <div style={{ width: 1, height: 10, background: grad }} />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BILONA GHEE ICONS
═══════════════════════════════════════════════════════════════════════════════ */

function IconMilkLota() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      <path d="M13 8 Q17 5.5 21 8 L22.5 11.5 Q27.5 15 26.5 21 Q25.5 28.5 17 30 Q8.5 28.5 7.5 21 Q6.5 15 11.5 11.5 Z"
        stroke={G80} strokeWidth="1.3" fill={G15} strokeLinejoin="round" />
      <path d="M11.5 8.5 Q17 11 22.5 8.5" stroke={G80} strokeWidth="1.1" fill="none" />
      <path d="M9.5 19.5 Q17 21.5 24.5 19.5" stroke={G35} strokeWidth="0.85" fill="none" />
      <path d="M10.5 15 Q10 19 11 24" stroke={C18} strokeWidth="0.9" strokeLinecap="round" />
      <path d="M21 8 Q23.5 6.5 24 5" stroke={G55} strokeWidth="1.0" strokeLinecap="round" />
    </svg>
  );
}

function IconEarthenPot() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      <path d="M15 8 Q6 9 5.5 18.5 Q5.5 28 17 30 Q28.5 28 28.5 18.5 Q28 9 19 8 Z"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      <ellipse cx="17" cy="8" rx="5" ry="2.2" stroke={G80} strokeWidth="1.2" />
      <path d="M8.5 18 Q11 16 13.5 18 Q16 20 18.5 18 Q21 16 23.5 18 Q25 19 25.5 18"
        stroke={G55} strokeWidth="0.85" fill="none" />
      <path d="M7.5 23 Q17 25 26.5 23" stroke={G15} strokeWidth="0.7" fill="none" />
      <path d="M8 17 Q7.5 21 8.5 25" stroke={C18} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

function IconChurner() {
  return (
    <svg width="62" height="62" viewBox="0 0 42 42" fill="none">
      <ellipse cx="21" cy="36" rx="13" ry="4" stroke={G80} strokeWidth="1.2" fill={G15} />
      <path d="M8 36 Q8 40 21 41.5 Q34 40 34 36" stroke={G80} strokeWidth="1.0" fill={G15} />
      <ellipse cx="21" cy="36" rx="7.5" ry="2.2"
        stroke={G55} strokeWidth="0.9" fill="none"
        style={{ animation: 'bld-ripple 2.2s ease-out infinite', transformOrigin: '21px 36px' }} />
      <g style={{ transformOrigin: '21px 32px', animation: 'bld-churn 1.65s ease-in-out infinite alternate' }}>
        <line x1="21" y1="6" x2="21" y2="32" stroke={G} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M17 7 Q21 3.5 25 7" stroke={G} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <line x1="17" y1="18" x2="25" y2="18" stroke={G80} strokeWidth="1.1" />
        <line x1="17" y1="21" x2="25" y2="21" stroke={G80} strokeWidth="1.1" />
        <path d="M17 18 Q11 16 3 10" stroke={G55} strokeWidth="1.35" fill="none" strokeLinecap="round" />
        <path d="M25 18 Q31 16 39 10" stroke={G55} strokeWidth="1.35" fill="none" strokeLinecap="round" />
        <circle cx="3"  cy="10" r="2.2" fill={G55} />
        <circle cx="39" cy="10" r="2.2" fill={G55} />
      </g>
    </svg>
  );
}

function IconButter() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      <ellipse cx="17" cy="28" rx="13.5" ry="3.5" stroke={G80} strokeWidth="1.2" fill={G15} />
      <path d="M6.5 28 Q6 19.5 12.5 16.5 Q17 14.5 21.5 16.5 Q28 19.5 27.5 28"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      <path d="M9.5 24.5 Q17 22.5 24.5 24.5" stroke={G55} strokeWidth="0.85" fill="none" />
      <path d="M11 21.5 Q17 19.5 23 21.5"   stroke={G35} strokeWidth="0.75" fill="none" />
      <path d="M11 22 Q12 18 14 17" stroke={C18} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

function IconGhee() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      <path d="M17 33.5 Q14.5 29.5 16.5 25.5 Q18 28.5 20.5 25.5 Q18.5 29.5 17 33.5"
        stroke="rgba(184,138,20,0.60)" strokeWidth="1.1" fill="rgba(184,138,20,0.22)"
        style={{ transformOrigin: '17px 33.5px', animation: 'bld-flame 1.35s ease-in-out infinite' }} />
      <path d="M5.5 24 Q5.5 21.5 9.5 21 L24.5 21 Q28.5 21.5 28.5 24 Q27.5 28.5 17 29.5 Q6.5 28.5 5.5 24 Z"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      <path d="M5.5 24.5 Q2.5 23.5 2.5 21.5 Q2.5 19.5 5.5 19.5" stroke={G80} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M28.5 24.5 Q31.5 23.5 31.5 21.5 Q31.5 19.5 28.5 19.5" stroke={G80} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M9 22.5 Q17 20.5 25 22.5" stroke={G} strokeWidth="1.2" fill="none" />
      <path d="M13.5 21 Q12.5 17 13.5 13" stroke={G55} strokeWidth="0.9" strokeLinecap="round" fill="none"
        style={{ animation: 'bld-steam 1.9s ease-out 0s infinite' }} />
      <path d="M20.5 21 Q21.5 17 20.5 13" stroke={G55} strokeWidth="0.9" strokeLinecap="round" fill="none"
        style={{ animation: 'bld-steam 1.9s ease-out 0.85s infinite' }} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   WOOD PRESSED OIL ICONS
═══════════════════════════════════════════════════════════════════════════════ */

function IconOilseeds() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      {/* Shallow basket / winnowing tray */}
      <path d="M5 23 Q5 29 17 31 Q29 29 29 23 L27 19 L7 19 Z"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      {/* Seeds arranged above basket rim */}
      <ellipse cx="17" cy="16" rx="3.2" ry="5.2" stroke={G80} strokeWidth="1.2"
        fill="rgba(184,138,20,0.22)" />
      <line x1="17" y1="11" x2="17" y2="21" stroke={G35} strokeWidth="0.75" />
      <ellipse cx="11" cy="17.5" rx="2.6" ry="4.4" stroke={G80} strokeWidth="1.1"
        fill="rgba(184,138,20,0.18)" transform="rotate(-22 11 17.5)" />
      <ellipse cx="23" cy="17.5" rx="2.6" ry="4.4" stroke={G80} strokeWidth="1.1"
        fill="rgba(184,138,20,0.18)" transform="rotate(22 23 17.5)" />
      <ellipse cx="8" cy="21.5" rx="2" ry="3.4" stroke={G55} strokeWidth="1.0"
        fill={G15} transform="rotate(30 8 21.5)" />
      <ellipse cx="26" cy="21.5" rx="2" ry="3.4" stroke={G55} strokeWidth="1.0"
        fill={G15} transform="rotate(-30 26 21.5)" />
    </svg>
  );
}

function IconSunDrying() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      {/* Sun */}
      <circle cx="17" cy="9" r="3.5" stroke={G80} strokeWidth="1.2" fill={G15} />
      {/* 8 rays */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const r = (deg * Math.PI) / 180;
        return (
          <line key={i}
            x1={17 + 5.0 * Math.cos(r)} y1={9 + 5.0 * Math.sin(r)}
            x2={17 + 7.2 * Math.cos(r)} y2={9 + 7.2 * Math.sin(r)}
            stroke={G55} strokeWidth="1.0" strokeLinecap="round"
            style={{ animation: `wpo-ray ${2 + i * 0.15}s ease-in-out ${i * 0.12}s infinite` }}
          />
        );
      })}
      {/* Flat drying tray */}
      <rect x="4" y="22" width="26" height="5.5" rx="1.2"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      {/* Seeds on tray */}
      <ellipse cx="10" cy="24.75" rx="1.8" ry="2.8" stroke={G55} strokeWidth="0.95"
        fill="rgba(184,138,20,0.20)" transform="rotate(-15 10 24.75)" />
      <ellipse cx="17" cy="24.75" rx="1.8" ry="2.8" stroke={G55} strokeWidth="0.95"
        fill="rgba(184,138,20,0.20)" />
      <ellipse cx="24" cy="24.75" rx="1.8" ry="2.8" stroke={G55} strokeWidth="0.95"
        fill="rgba(184,138,20,0.20)" transform="rotate(15 24 24.75)" />
      {/* Tray legs */}
      <line x1="8"  y1="27.5" x2="8"  y2="31" stroke={G55} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="26" y1="27.5" x2="26" y2="31" stroke={G55} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconWoodPress() {
  return (
    <svg width="62" height="62" viewBox="0 0 42 42" fill="none">
      {/* Stone mortar base */}
      <ellipse cx="21" cy="35" rx="13.5" ry="4.5" stroke={G80} strokeWidth="1.3" fill={G15} />
      <path d="M7.5 35 Q7.5 39.5 21 41 Q34.5 39.5 34.5 35" stroke={G80} strokeWidth="1.1" fill={G15} />
      {/* Mortar rim detail */}
      <ellipse cx="21" cy="35" rx="13.5" ry="4.5" stroke={G55} strokeWidth="0.7" fill="none"
        style={{ opacity: 0.5 }} />

      {/* Ripple in mortar */}
      <ellipse cx="21" cy="35" rx="7" ry="2.2"
        stroke={G35} strokeWidth="0.9" fill="none"
        style={{ animation: 'bld-ripple 2.4s ease-out infinite', transformOrigin: '21px 35px' }} />

      {/* Oil drops falling from mortar base */}
      <circle cx="21" cy="42" r="1.8" fill={G55}
        style={{ animation: 'wpo-oil-drop 2.2s ease-in 0.4s infinite' }} />
      <circle cx="17" cy="42" r="1.2" fill={G35}
        style={{ animation: 'wpo-oil-drop 2.2s ease-in 1.3s infinite' }} />

      {/* Central vertical shaft */}
      <line x1="21" y1="7" x2="21" y2="32"
        stroke={G} strokeWidth="2.2" strokeLinecap="round" />
      {/* Shaft top cap */}
      <circle cx="21" cy="7" r="2.5" stroke={G} strokeWidth="1.5" fill={G15} />

      {/* Rotating beam (kachi ghani arm) */}
      <g style={{ transformOrigin: '21px 19px', animation: 'wpo-beam 3.2s linear infinite' }}>
        {/* Main beam — long horizontal bar */}
        <line x1="3" y1="19" x2="39" y2="19"
          stroke={G} strokeWidth="2.4" strokeLinecap="round" />
        {/* Beam notch marks (wood grain detail) */}
        <line x1="10" y1="17.5" x2="10" y2="20.5" stroke={G80} strokeWidth="1.0" />
        <line x1="32" y1="17.5" x2="32" y2="20.5" stroke={G80} strokeWidth="1.0" />
        {/* End weights / yoke holes */}
        <circle cx="3"  cy="19" r="2.8" stroke={G80} strokeWidth="1.2" fill={DARK} />
        <circle cx="3"  cy="19" r="1.2" fill={G55} />
        <circle cx="39" cy="19" r="2.8" stroke={G80} strokeWidth="1.2" fill={DARK} />
        <circle cx="39" cy="19" r="1.2" fill={G55} />
      </g>
    </svg>
  );
}

function IconFiltration() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      {/* Hanging muslin cloth filter (tied at top corners) */}
      {/* Top rod */}
      <line x1="4" y1="8" x2="30" y2="8" stroke={G80} strokeWidth="1.5" strokeLinecap="round" />
      {/* Small hooks at ends */}
      <path d="M4 8 Q4 5 7 5"  stroke={G55} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M30 8 Q30 5 27 5" stroke={G55} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* Cloth bag hanging down */}
      <path d="M6 8 Q5 19 17 28 Q29 19 28 8"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      {/* Cloth fold lines */}
      <path d="M9 10 Q10 19 17 25"  stroke={G35} strokeWidth="0.75" fill="none" strokeLinecap="round" />
      <path d="M25 10 Q24 19 17 25" stroke={G35} strokeWidth="0.75" fill="none" strokeLinecap="round" />
      {/* Oil drop at tip */}
      <path d="M17 27 Q15.2 30.5 17 33 Q18.8 30.5 17 27"
        stroke={G55} strokeWidth="1.1" fill="rgba(184,138,20,0.25)"
        style={{ animation: 'bld-drop 2.2s ease-in 0s infinite' }} />
    </svg>
  );
}

function IconPureOil() {
  return (
    <svg width="50" height="50" viewBox="0 0 34 34" fill="none">
      {/* Bottle cap */}
      <rect x="14.5" y="4" width="5" height="4" rx="1"
        stroke={G80} strokeWidth="1.2" fill={G15} />
      {/* Neck */}
      <path d="M14.5 8 L12.5 13 L21.5 13 L19.5 8"
        stroke={G80} strokeWidth="1.2" fill={G15} />
      {/* Body */}
      <path d="M11 13 Q8 15 8 20 L8 26.5 Q8 31 17 31 Q26 31 26 26.5 L26 20 Q26 15 23 13 Z"
        stroke={G80} strokeWidth="1.3" fill={G15} />
      {/* Oil level line */}
      <path d="M9.5 22.5 Q17 20.5 24.5 22.5" stroke={G} strokeWidth="1.2" fill="none" />
      {/* Oil fill below level */}
      <path d="M9.5 22.5 Q17 20.5 24.5 22.5 L25.5 26.5 Q25 30 17 30 Q9 30 8.5 26.5 Z"
        fill="rgba(184,138,20,0.22)" />
      {/* Label */}
      <rect x="12" y="15.5" width="10" height="5.5" rx="1"
        stroke={G35} strokeWidth="0.8" fill="none" />
      <line x1="13.5" y1="17.5" x2="21.5" y2="17.5" stroke={G35} strokeWidth="0.6" />
      <line x1="13.5" y1="19.5" x2="20"   y2="19.5" stroke={G35} strokeWidth="0.6" />
      {/* Shine */}
      <path d="M10.5 17.5 Q10 21 10.5 25.5" stroke={C18} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP DATA
═══════════════════════════════════════════════════════════════════════════════ */

interface StepDef {
  Icon: () => JSX.Element;
  label: string;
  sub: string;
  badge: string;
  hero: boolean;
}

const BILONA_STEPS: StepDef[] = [
  { Icon: IconMilkLota,   label: 'A2 Milk',   sub: 'Fresh desi cow',   badge: '01', hero: false },
  { Icon: IconEarthenPot, label: 'Curdling',   sub: 'Overnight set',    badge: '02', hero: false },
  { Icon: IconChurner,    label: 'Churning',   sub: '★ Bilona method',  badge: '03', hero: true  },
  { Icon: IconButter,     label: 'Butter',     sub: 'Cream separated',  badge: '04', hero: false },
  { Icon: IconGhee,       label: 'Pure Ghee',  sub: 'Slow-heated gold', badge: '05', hero: false },
];

const WOODPRESSED_STEPS: StepDef[] = [
  { Icon: IconOilseeds,   label: 'Oilseeds',    sub: 'Raw sesame & nuts',  badge: '01', hero: false },
  { Icon: IconSunDrying,  label: 'Sun Drying',  sub: 'Cleaned & dried',    badge: '02', hero: false },
  { Icon: IconWoodPress,  label: 'Wood Press',  sub: '★ Kachi Ghani',      badge: '03', hero: true  },
  { Icon: IconFiltration, label: 'Filtration',  sub: 'Natural filtered',   badge: '04', hero: false },
  { Icon: IconPureOil,    label: 'Pure Oil',    sub: 'No heat, no refine', badge: '05', hero: false },
];

const RIGHT_CONFIG = {
  bilona:      { devanagari: 'बिलोना', caption: 'Traditional Method' },
  woodpressed: { devanagari: 'घानी',   caption: 'Cold Pressed'       },
};

/* ─── Framer variants ────────────────────────────────────────────────────────── */
const stepVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, delay: 0.15 + i * 0.14, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] },
  }),
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/* ─── Main export ────────────────────────────────────────────────────────────── */
export default function BilonaSideDecor({
  visible,
  variant = 'bilona',
}: {
  visible: boolean;
  variant?: 'bilona' | 'woodpressed';
}) {
  const steps      = variant === 'woodpressed' ? WOODPRESSED_STEPS : BILONA_STEPS;
  const rightCfg   = RIGHT_CONFIG[variant];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <AnimatePresence>
        {visible && (
          <>
            {/* ══════════════════════════════ LEFT PANEL ════════════════════════════════ */}
            <motion.aside
              key={`bld-left-${variant}`}
              aria-hidden
              initial={{ opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-0 pointer-events-none hidden xl:flex flex-col items-center justify-center"
              style={{ right: 'auto', width: 164, zIndex: 5 }}
            >
              <div aria-hidden style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(4,14,2,0.92) 0%, rgba(4,14,2,0.75) 60%, transparent 100%)',
              }} />
              <motion.div
                initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                transition={{ duration: 1.1, delay: 0.1, ease: 'easeOut' }}
                aria-hidden
                style={{
                  position: 'absolute', width: 1, top: '8%', bottom: '8%', left: '50%',
                  background: `linear-gradient(to bottom, transparent, ${G35} 12%, ${G35} 88%, transparent)`,
                  transformOrigin: 'top',
                }}
              />

              <div className="relative flex flex-col items-center" style={{ paddingTop: 8, paddingBottom: 8 }}>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}>
                  <CapOrnament />
                </motion.div>

                {steps.map(({ Icon, label, sub, badge, hero }, i) => (
                  <div key={badge} className="flex flex-col items-center">
                    {i > 0 && <Connector stepNum={badge} hero={hero} />}

                    <motion.div
                      custom={i} variants={stepVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="relative flex flex-col items-center"
                    >
                      {hero && (
                        <div aria-hidden style={{
                          position: 'absolute', inset: -12, borderRadius: '50%',
                          border: `1.5px solid rgba(184,138,20,0.55)`,
                          animation: 'bld-glow 2.4s ease-in-out infinite',
                        }} />
                      )}
                      <div style={{
                        animation: hero ? undefined : `bld-breathe ${4.5 + i * 0.5}s ease-in-out ${i * 0.4}s infinite`,
                      }}>
                        <Icon />
                      </div>
                      <div style={{
                        marginTop: 4, fontSize: hero ? 10 : 8,
                        letterSpacing: '0.20em', textTransform: 'uppercase',
                        fontFamily: 'monospace', color: hero ? G : G80,
                        textAlign: 'center', lineHeight: 1.25, fontWeight: hero ? 700 : 500,
                      }}>
                        {label}
                      </div>
                      <div style={{
                        marginTop: 2, fontSize: 7.5, letterSpacing: '0.10em',
                        fontFamily: 'monospace', color: hero ? G55 : G35,
                        textAlign: 'center', lineHeight: 1.3, whiteSpace: 'nowrap',
                      }}>
                        {sub}
                      </div>
                    </motion.div>
                  </div>
                ))}

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.9 }}>
                  <CapOrnament flip />
                </motion.div>
              </div>
            </motion.aside>

            {/* ══════════════════════════════ RIGHT PANEL ═══════════════════════════════ */}
            <motion.aside
              key={`bld-right-${variant}`}
              aria-hidden
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 1.0, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-0 pointer-events-none hidden xl:flex flex-col items-center justify-center"
              style={{ left: 'auto', width: 164, zIndex: 5 }}
            >
              <div aria-hidden style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to left, rgba(4,14,2,0.92) 0%, rgba(4,14,2,0.75) 60%, transparent 100%)',
              }} />
              <motion.div
                initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                transition={{ duration: 1.1, delay: 0.12, ease: 'easeOut' }}
                aria-hidden
                style={{
                  position: 'absolute', width: 1, top: '8%', bottom: '8%', left: '50%',
                  background: `linear-gradient(to bottom, transparent, ${G35} 12%, ${G35} 88%, transparent)`,
                  transformOrigin: 'top',
                }}
              />

              <div className="relative flex flex-col items-center" style={{ paddingTop: 8, paddingBottom: 8 }}>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.12 }}>
                  <CapOrnament />
                </motion.div>

                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                  transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                  style={{ width: 1, height: 48, background: `linear-gradient(to bottom, ${G55}, ${G35})`, margin: '6px 0', transformOrigin: 'top' }} />

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  style={{
                    transform: 'rotate(90deg)',
                    fontFamily: '"Noto Serif", "Mukta", serif',
                    fontSize: 30, letterSpacing: '0.18em',
                    color: G80, whiteSpace: 'nowrap',
                    margin: '22px 0',
                    animation: 'bld-glow 5s ease-in-out infinite',
                  }}
                >
                  {rightCfg.devanagari}
                </motion.div>

                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                  transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
                  style={{ width: 1, height: 40, background: `linear-gradient(to bottom, ${G35}, ${G55})`, margin: '6px 0', transformOrigin: 'top' }} />

                <div className="flex flex-col items-center">
                  {steps.map(({ label, badge }, i) => (
                    <div key={badge} className="flex flex-col items-center">
                      <motion.div
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
                        className="flex flex-col items-center"
                      >
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: i === 2 ? 18 : 13, fontWeight: i === 2 ? 700 : 500,
                          color: i === 2 ? G : G55,
                          letterSpacing: '0.06em', lineHeight: 1, padding: '5px 0',
                        }}>{badge}</div>
                        <div style={{
                          fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
                          fontFamily: 'monospace',
                          color: i === 2 ? G80 : G35,
                          lineHeight: 1, marginBottom: 4,
                        }}>{label}</div>
                      </motion.div>
                      {i < steps.length - 1 && (
                        <motion.div
                          initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                          transition={{ duration: 0.4, delay: 0.65 + i * 0.1, ease: 'easeOut' }}
                          style={{
                            width: 1, height: 36,
                            background: i === 1 ? `linear-gradient(to bottom, ${G35}, ${G})`
                              : i === 2 ? `linear-gradient(to bottom, ${G}, ${G35})`
                              : 'rgba(184,138,20,0.28)',
                            transformOrigin: 'top',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                  transition={{ duration: 0.5, delay: 1.15, ease: 'easeOut' }}
                  style={{ width: 1, height: 40, background: `linear-gradient(to bottom, ${G55}, ${G35})`, margin: '6px 0', transformOrigin: 'top' }} />

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 1.2 }}
                  className="flex flex-col items-center gap-[14px]"
                >
                  {[
                    { w: 12, h: 16, d: '0s'   },
                    { w: 15, h: 20, d: '0.65s' },
                    { w: 10, h: 14, d: '1.3s'  },
                  ].map(({ w, h, d }, i) => (
                    <div key={i} style={{
                      width: w, height: h,
                      borderRadius: `${w/2}px ${w/2}px ${w*0.35}px ${w*0.35}px / ${w*0.55}px ${w*0.55}px ${h*0.6}px ${h*0.6}px`,
                      background: 'radial-gradient(ellipse at 38% 28%, rgba(220,175,60,0.95), rgba(160,112,16,0.60))',
                      boxShadow: '0 2px 8px rgba(184,138,20,0.35)',
                      animation: `bld-drop 2.3s ease-in ${d} infinite`,
                    }} />
                  ))}
                </motion.div>

                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }}
                  transition={{ duration: 0.5, delay: 1.3, ease: 'easeOut' }}
                  style={{ width: 1, height: 40, background: `linear-gradient(to bottom, ${G35}, transparent)`, margin: '6px 0', transformOrigin: 'top' }} />

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, delay: 1.4 }}
                  style={{
                    transform: 'rotate(90deg)', fontSize: 11,
                    letterSpacing: '0.26em', textTransform: 'uppercase',
                    fontFamily: 'monospace', color: G55,
                    whiteSpace: 'nowrap', margin: '14px 0',
                  }}
                >
                  {rightCfg.caption}
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 1.0 }}>
                  <CapOrnament flip />
                </motion.div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
