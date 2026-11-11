'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, MessageCircle, ShoppingCart, Package, MapPin, Factory, Receipt, Phone, Users, Settings,
  Network, Search, ExternalLink, Plus, Minus, Maximize2, X, ArrowRight, ArrowLeft, Link2, type LucideIcon,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { MINDMAP, type MMNode, type MMSystem } from '@/lib/mindmap-data';

const ICONS: Record<string, LucideIcon> = { ShoppingBag, MessageCircle, ShoppingCart, Package, MapPin, Factory, Receipt, Phone, Users, Settings };
const NW = 260, NH = 46, SW = 270, SH = 72, ROW = 70, SYS_X = 440, CH_X = 900;

interface Pos { x: number; y: number; w: number; h: number; color: string; sys: string; side: 1 | -1 }

function buildLayout(collapsed: Set<string>) {
  const sides: Record<string, MMSystem[]> = { '1': [], '-1': [] };
  const sums: Record<string, number> = { '1': 0, '-1': 0 };
  const slot = (s: MMSystem) => (collapsed.has(s.id) ? 1 : s.children.length) * ROW + 70;
  MINDMAP.forEach((s) => {
    const k = sums['1'] <= sums['-1'] ? '1' : '-1'; // balance left/right by height
    sides[k].push(s);
    sums[k] += slot(s);
  });
  const pos = new Map<string, Pos>();
  (['1', '-1'] as const).forEach((k) => {
    const side = Number(k) as 1 | -1;
    let y = -sums[k] / 2;
    sides[k].forEach((s) => {
      const h = slot(s);
      pos.set(s.id, { x: side * SYS_X, y: y + h / 2, w: SW, h: SH, color: s.color, sys: s.id, side });
      if (!collapsed.has(s.id)) {
        s.children.forEach((c, i) =>
          pos.set(c.id, { x: side * CH_X, y: y + 35 + i * ROW + ROW / 2, w: NW, h: NH, color: s.color, sys: s.id, side }),
        );
      }
      y += h;
    });
  });
  return pos;
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
};

function Stage({ n, color, title, children }: { n: number; color: string; title: string; children: React.ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[41px] top-0 grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white ring-4 ring-white" style={{ background: color }}>{n}</span>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </li>
  );
}

export default function MindmapPage() {
  // start as a readable overview: systems only, expanded on click
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(MINDMAP.map((s) => s.id)));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, k: 0.7 });
  const [anim, setAnim] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const pos = useMemo(() => buildLayout(collapsed), [collapsed]);
  const sysById = useMemo(() => new Map(MINDMAP.map((s) => [s.id, s])), []);
  const nodeById = useMemo(() => {
    const m = new Map<string, { node: MMNode; sys: MMSystem }>();
    MINDMAP.forEach((s) => s.children.forEach((c) => m.set(c.id, { node: c, sys: s })));
    return m;
  }, []);
  // every directed data flow: [from, to, label]
  const flows = useMemo(() => {
    const f: [string, string, string][] = [];
    nodeById.forEach(({ node }) => node.to?.forEach(([t, l]) => nodeById.has(t) && f.push([node.id, t, l])));
    return f;
  }, [nodeById]);

  // a collapsed child resolves to its system node
  // collapsed modules share their system's spot, so arrows to the same spot merge into one
  const nodeId = (id: string) => (pos.has(id) ? id : nodeById.get(id)?.sys.id ?? id);
  const posRef = useRef(pos);
  posRef.current = pos; // deferred centerOn calls must see the layout after expand/collapse
  const at = useCallback((id: string) => pos.get(id) ?? pos.get(nodeById.get(id)?.sys.id ?? ''), [pos, nodeById]);

  const centerOn = useCallback((id: string, k?: number) => {
    const p = posRef.current.get(id) ?? posRef.current.get(nodeById.get(id)?.sys.id ?? ''), el = box.current;
    if (!p || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const kk = k ?? Math.max(view.k, 0.9);
    setAnim(true);
    setView({ k: kk, x: width / 2 - p.x * kk, y: height / 2 - p.y * kk });
  }, [nodeById, view.k]);

  const fitTo = (id: string) => centerOn(id, 0.95);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const all = Array.from(pos.values());
    const minX = Math.min(...all.map((p) => p.x - p.w / 2)) - 40, maxX = Math.max(...all.map((p) => p.x + p.w / 2)) + 40;
    const minY = Math.min(...all.map((p) => p.y - p.h / 2)) - 40, maxY = Math.max(...all.map((p) => p.y + p.h / 2)) + 40;
    const k = Math.min(width / (maxX - minX), height / (maxY - minY), 1.2);
    setAnim(true);
    setView({ k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k });
  }, [pos]);

  // refit once the container has its real size (panel/viewport settle after mount)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (!touched.current) fit(); }); // keep centred until the user moves it
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wheel needs a non-passive listener to stop page scroll
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setAnim(false);
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f: number) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnim(true);
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.2, v.k * f));
      return { k, x: r.width / 2 - ((r.width / 2 - v.x) / v.k) * k, y: r.height / 2 - ((r.height / 2 - v.y) / v.k) * k };
    });
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const m = new Set<string>();
    MINDMAP.forEach((s) => {
      if (s.label.toLowerCase().includes(q)) m.add(s.id);
      s.children.forEach((c) => {
        if ([c.label, c.desc, c.api ?? '', ...c.steps, ...(c.formula ?? []), c.out].join(' ').toLowerCase().includes(q)) m.add(c.id);
      });
    });
    return m;
  }, [q]);

  // selection → modules (and their systems) that stay lit
  const { related } = useMemo(() => {
    const rel = new Set<string>();
    if (selected) {
      const ids = sysById.has(selected) ? sysById.get(selected)!.children.map((c) => c.id) : [selected];
      ids.forEach((i) => {
        rel.add(i);
        const nd = nodeById.get(i)!.node;
        nd.to?.forEach(([t]) => rel.add(t));
        nd.in.forEach(([f]) => nodeById.has(f) && rel.add(f));
        flows.forEach(([a, b]) => { if (b === i) rel.add(a); });
      });
      rel.add(selected);
      Array.from(rel).forEach((i) => { const sid = nodeById.get(i)?.sys.id; if (sid) rel.add(sid); });
    }
    return { related: rel };
  }, [selected, flows, sysById, nodeById]);

  const dimmed = (id: string, sysId: string) =>
    (selected ? !related.has(id) && !(sysById.has(selected) && sysId === selected) : false) || (matches ? !matches.has(id) : false);

  const select = (id: string | null) => {
    setSelected((cur) => (cur === id ? null : id));
    if (id && sysById.has(id) && collapsed.has(id)) {
      setCollapsed(new Set(MINDMAP.filter((s) => s.id !== id).map((s) => s.id))); // one open branch at a time keeps it calm
      setTimeout(() => centerOn(id, 0.8), 30);
    }
  };
  const setAll = (collapse: boolean) => {
    setCollapsed(collapse ? new Set(MINDMAP.map((s) => s.id)) : new Set());
    setSelected(null);
    setTimeout(fit, 30);
  };
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sel = selected ? nodeById.get(selected) : undefined;
  const selSys = selected ? sysById.get(selected) : undefined;
  const handedTo = sel ? sel.node.to ?? [] : [];
  const rawIn = (sel?.node.in ?? []);

  const jump = (id: string) => {
    const s = nodeById.get(id)?.sys.id;
    if (s && collapsed.has(s)) setCollapsed(new Set(MINDMAP.filter((x) => x.id !== s).map((x) => x.id)));
    setSelected(id);
    setTimeout(() => fitTo(id), 30);
  };

  const Chip = ({ id, label }: { id: string; label: string }) => {
    const t = nodeById.get(id);
    return (
      <button onClick={() => jump(id)} className="flex w-full items-center gap-2 rounded-lg border border-black/[0.07] bg-white px-2.5 py-1.5 text-left text-xs hover:border-black/20 hover:shadow-sm transition">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t?.sys.color }} />
        <span className="min-w-0 flex-1"><b className="text-gray-900">{t?.node.label}</b><span className="text-gray-500"> · {label}</span></span>
      </button>
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      <Header title="System Mindmap" description="How every module connects — click a module to see how it works" icon={<Network className="h-5 w-5 text-gray-700" />} />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={box}
          className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#F7F5F0] cursor-grab active:cursor-grabbing"
          style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,.09) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          onPointerDown={(e) => { touched.current = true; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; setAnim(false); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }}
          onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4 && (e.target as Element).closest('[data-bg]')) setSelected(null); }}
        >
          <svg className="h-full w-full" data-bg>
            <defs>
              <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="context-stroke" />
              </marker>
              <linearGradient id="mm-root" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#111827" /><stop offset="1" stopColor="#374151" />
              </linearGradient>
              <filter id="mm-shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="6" floodOpacity=".10" />
              </filter>
            </defs>
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
              style={{ transition: anim ? 'transform .5s cubic-bezier(.2,.8,.2,1)' : 'none' }}
              data-bg
            >
              {/* tree edges */}
              {MINDMAP.map((s) => {
                const p = pos.get(s.id)!;
                const dim = dimmed(s.id, s.id);
                return (
                  <g key={s.id} opacity={dim ? 0.15 : 1} style={{ transition: 'opacity .25s' }}>
                    <path d={curve(p.side * 120, 0, p.x - p.side * (SW / 2), p.y)} stroke={s.color} strokeWidth={4} fill="none" strokeLinecap="round" />
                    {!collapsed.has(s.id) && s.children.map((c) => {
                      const cp = pos.get(c.id)!;
                      return <path key={c.id} d={curve(p.x + p.side * (SW / 2), p.y, cp.x - p.side * (NW / 2), cp.y)} stroke={s.color} strokeWidth={2} fill="none" opacity={dimmed(c.id, s.id) ? 0.15 : 0.45} />;
                    })}
                  </g>
                );
              })}

              {/* root */}
              <g filter="url(#mm-shadow)">
                <rect x={-120} y={-52} width={240} height={104} rx={28} fill="url(#mm-root)" />
                <text y={-4} textAnchor="middle" fill="#fff" fontSize={26} fontWeight={700} style={{ fontFamily: 'inherit' }}>NatureLite</text>
                <text y={22} textAnchor="middle" fill="#9ca3af" fontSize={13}>whole system map</text>
              </g>

              {/* systems + modules */}
              {MINDMAP.map((s) => {
                const p = pos.get(s.id)!;
                const Icon = ICONS[s.icon] ?? Package;
                const isSel = selected === s.id;
                const toggleX = p.x + p.side * (SW / 2 + 22);
                return (
                  <g key={s.id}>
                    <g
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => select(s.id)}
                      onDoubleClick={() => centerOn(s.id, 0.9)}
                      className="cursor-pointer"
                      opacity={dimmed(s.id, s.id) && !(selected && related.has(s.id)) ? 0.3 : 1}
                      style={{ transition: 'opacity .25s' }}
                      filter="url(#mm-shadow)"
                    >
                      <rect x={p.x - SW / 2} y={p.y - SH / 2} width={SW} height={SH} rx={16} fill={s.color} stroke={isSel ? '#111827' : 'none'} strokeWidth={3} />
                      <Icon x={p.x - SW / 2 + 20} y={p.y - 12} width={24} height={24} color="#fff" strokeWidth={2.2} />
                      <text x={p.x - SW / 2 + 56} y={p.y + 6} fill="#fff" fontSize={18} fontWeight={700}>{s.label}</text>
                    </g>
                    <g onPointerDown={(e) => e.stopPropagation()} onClick={() => toggle(s.id)} className="cursor-pointer">
                      <circle cx={toggleX} cy={p.y} r={13} fill="#fff" stroke={s.color} strokeWidth={2} />
                      <text x={toggleX} y={p.y + 5} textAnchor="middle" fontSize={collapsed.has(s.id) ? 12 : 17} fontWeight={700} fill={s.color}>
                        {collapsed.has(s.id) ? s.children.length : '–'}
                      </text>
                    </g>
                    {!collapsed.has(s.id) && s.children.map((c) => {
                      const cp = pos.get(c.id)!;
                      const isCSel = selected === c.id;
                      const lit = !!matches?.has(c.id);
                      return (
                        <g
                          key={c.id}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => { select(c.id); if (selected !== c.id) setTimeout(() => fitTo(c.id), 30); }}
                          className="cursor-pointer mm-node"
                          opacity={dimmed(c.id, s.id) ? 0.28 : 1}
                          style={{ transition: 'opacity .25s' }}
                        >
                          <rect x={cp.x - NW / 2} y={cp.y - NH / 2} width={NW} height={NH} rx={NH / 2} fill={isCSel ? s.color : '#fff'} stroke={s.color} strokeWidth={isCSel || lit ? 3 : 1.5} filter="url(#mm-shadow)" />
                          <circle cx={cp.x - NW / 2 + 22} cy={cp.y} r={6} fill={isCSel ? '#fff' : s.color} />
                          <text x={cp.x - NW / 2 + 38} y={cp.y + 5.5} fontSize={16} fontWeight={600} fill={isCSel ? '#fff' : '#1f2937'}>{c.label}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* toolbar */}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter' && matches?.size) { const ids = Array.from(matches); jump(ids.find((m) => nodeById.has(m)) ?? ids[0]); } }}
                placeholder="Search any feature…"
                className="h-9 w-52 rounded-full border border-black/10 bg-white pl-8 pr-3 text-sm shadow-sm outline-none focus:border-black/30 sm:w-64"
              />
            </div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setAll(collapsed.size < MINDMAP.length)}
              className="h-9 rounded-full border border-black/10 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              {collapsed.size < MINDMAP.length ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
            {[[Plus, () => zoom(1.25), 'Zoom in'], [Minus, () => zoom(0.8), 'Zoom out'], [Maximize2, fit, 'Fit to screen']].map(([I, fn, t], i) => {
              const Ic = I as LucideIcon;
              return (
                <button key={i} onClick={fn as () => void} title={t as string} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-gray-700 shadow-sm hover:bg-gray-50">
                  <Ic className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 hidden rounded-xl border border-black/[0.07] bg-white/90 px-3 py-2 text-[11px] text-gray-600 shadow-sm sm:block">
            Drag to pan · scroll to zoom · click a node for details<br />
            Click a module to see its inputs, process, formula and result · <b>–/+</b> collapse a system
          </div>
        </div>

        {/* detail panel */}
        <aside className="max-h-[45%] w-full shrink-0 overflow-y-auto border-t border-black/[0.07] bg-white md:max-h-none md:w-[460px] md:border-l md:border-t-0">
          {!selected && (
            <div className="p-5">
              <h2 className="font-display text-lg italic text-gray-900">Explore the system</h2>
              <p className="mt-1 text-sm text-gray-500">Pick a node to see what it does, its features, the page that runs it and exactly which modules it talks to.</p>
              <div className="mt-4 space-y-2">
                {MINDMAP.map((s) => {
                  const Icon = ICONS[s.icon] ?? Package;
                  return (
                    <button key={s.id} onClick={() => { setSelected(null); select(s.id); }} className="flex w-full items-start gap-3 rounded-xl border border-black/[0.07] p-3 text-left transition hover:border-black/20 hover:shadow-sm">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: s.color }}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <b className="text-sm text-gray-900">{s.label} <span className="font-normal text-gray-400">· {s.children.length}</span></b>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-gray-500">{s.summary}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selSys && (
            <div className="p-5">
              <button onClick={() => setSelected(null)} className="float-right rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: selSys.color }}>System</span>
              <h2 className="mt-2 font-display text-xl italic text-gray-900">{selSys.label}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{selSys.summary}</p>
              <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Modules ({selSys.children.length})</h3>
              <div className="space-y-1.5">
                {selSys.children.map((c) => (
                  <button key={c.id} onClick={() => jump(c.id)} className="w-full rounded-lg border border-black/[0.07] px-3 py-2 text-left transition hover:border-black/20 hover:shadow-sm">
                    <b className="text-sm text-gray-900">{c.label}</b>
                    <span className="block text-xs text-gray-500">{c.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sel && (
            <div className="p-5">
              <button onClick={() => setSelected(null)} className="float-right rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              <button onClick={() => jump(sel.sys.id)} className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: sel.sys.color }}>{sel.sys.label}</button>
              <h2 className="mt-2 font-display text-xl italic text-gray-900">{sel.node.label}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{sel.node.desc}</p>

              {(sel.node.href || sel.node.api) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {sel.node.href && (
                    <Link href={sel.node.href} target={['/admin', '/crm', '/billing', '/fms'].some((p) => sel.node.href!.startsWith(p)) ? undefined : '_blank'} className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-700">
                      Open page <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {sel.node.api && <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-[11px] text-gray-600">api: {sel.node.api}</span>}
                </div>
              )}

              <ol className="relative mt-6 space-y-6 border-l-2 pl-6" style={{ borderColor: sel.sys.color + '55' }}>
                <Stage n={1} color={sel.sys.color} title="Takes in">
                  {rawIn.length ? (
                    <div className="space-y-1.5">
                      {rawIn.map(([src, what], i) =>
                        nodeById.has(src) ? <Chip key={i} id={src} label={what} /> : (
                          <div key={i} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700"><b className="text-gray-900">{src}</b> · {what}</div>
                        ))}
                    </div>
                  ) : <p className="text-xs text-gray-400">Nothing — it is a reference page.</p>}
                </Stage>
                <Stage n={2} color={sel.sys.color} title="What it does with it">
                  <ol className="space-y-1.5">
                    {sel.node.steps.map((st, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-snug text-gray-700">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{i + 1}</span>{st}
                      </li>
                    ))}
                  </ol>
                  {sel.node.formula && (
                    <div className="mt-3 rounded-xl border border-black/[0.08] bg-[#F7F5F0] p-3">
                      <p className="mb-1.5 text-xs font-semibold text-gray-500">Formula / rule</p>
                      <ul className="space-y-1.5 font-mono text-[12px] leading-snug text-gray-800">
                        {sel.node.formula.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                </Stage>
                <Stage n={3} color={sel.sys.color} title="Result">
                  <p className="rounded-lg px-3 py-2 text-sm font-medium text-gray-900" style={{ background: sel.sys.color + '18' }}>{sel.node.out}</p>
                </Stage>
                <Stage n={4} color={sel.sys.color} title="Passes on to">
                  {handedTo.length ? (
                    <div className="space-y-1.5">{handedTo.map(([t, l], i) => <Chip key={i} id={t} label={l} />)}</div>
                  ) : <p className="text-xs text-gray-400">Final stop — people read or use this directly.</p>}
                </Stage>
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
