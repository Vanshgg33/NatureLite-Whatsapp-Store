'use client';

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Svg,
  Rect,
  Line,
  G,
  StyleSheet,
} from '@react-pdf/renderer';

// ── Types ──────────────────────────────────────────────────────────────────
export type AnalyticsPdfData = {
  title: string;
  period: string;
  fromDate: string;
  toDate: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalCustomers: number;
  periodComparison?: { revenueChange: number; ordersChange: number } | null;
  revenueChartData?: Array<{ date: string; revenue: number; orders: number }>;
  dayOfWeekData?: Array<{ day: string; avgRevenue: number; avgOrders: number }>;
  topProducts?: Array<{ name: string; sold: number; revenue: number }>;
  newCustomers?: number;
  returningCustomers?: number;
  paymentMethods?: Array<{ name: string; value: number }>;
  topCustomers?: Array<{ name: string; totalOrders: number; totalSpent: number }>;
  lowStockItems?: Array<{ name: string; stock: number }>;
  narrative?: {
    summary: string;
    highlights: string[];
    watchouts: string[];
    actions: string[];
  };
};

// ── Palette ────────────────────────────────────────────────────────────────
const INK    = '#0F2318';
const GREEN  = '#1E3D2B';
const MID    = '#2F6B47';
const GOLD   = '#D4A017';
const SOFT   = '#EEF7F1';
const WHITE  = '#FFFFFF';
const TEXT   = '#1A2E22';
const SUB    = '#374151';
const MUTED  = '#6B7C72';
const BORDER = '#D1E6D8';
const RED    = '#DC2626';
const REDBG  = '#FEF2F2';
const BLUE   = '#2563EB';
const BLUEBG = '#EFF6FF';
const ORANGE = '#D97706';
const ORNBG  = '#FFFBEB';
const PURPLE = '#7C3AED';
const PURPBG = '#F5F3FF';
const TEAL   = '#0891B2';
const TEALBG = '#ECFEFF';
const GREEN2 = '#059669';
const GRN2BG = '#D1FAE5';

const CHART_COLORS = [MID, GOLD, BLUE, PURPLE, TEAL, ORANGE, RED, '#EC4899'];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  if (n >= 10_000_000) return `Rs.${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)   return `Rs.${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)     return `Rs.${(n / 1_000).toFixed(1)}K`;
  return `Rs.${n.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`;
}

function signPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function shortDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dt.getDate()} ${months[dt.getMonth()]}`;
}

function nowStr(): string {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 9, color: TEXT },
  // ── Header
  goldBar:  { height: 4, backgroundColor: GOLD },
  header:   { backgroundColor: INK, paddingHorizontal: 36, paddingTop: 30, paddingBottom: 26, position: 'relative', overflow: 'hidden' },
  dec1:     { position: 'absolute', top: -30, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: '#16301F', opacity: 0.7 },
  dec2:     { position: 'absolute', top: 10, right: 20,  width:  80, height:  80, borderRadius: 40, backgroundColor: '#1A3520', opacity: 0.8 },
  dec3:     { position: 'absolute', bottom: -10, left: -10, width: 60, height: 60, borderRadius: 30, backgroundColor: '#12281A', opacity: 0.5 },
  brandPill:{ alignSelf: 'flex-start', backgroundColor: '#1A3826', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  brandTxt: { color: GOLD, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  rptLabel: { color: '#4A8060', fontSize: 7, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  hTitle:   { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 22, lineHeight: 1.2, marginBottom: 8 },
  hSub:     { color: '#8ABF9F', fontSize: 9.5, lineHeight: 1.5 },
  hMeta:    { marginTop: 18, flexDirection: 'row', gap: 6 },
  hChip:    { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1 },
  hChipLbl: { color: 'rgba(255,255,255,0.38)', fontSize: 6, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  hChipVal: { color: WHITE, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  // ── Continuation header (pages 2+)
  contGold: { height: 3, backgroundColor: GOLD },
  contBar:  { backgroundColor: INK, paddingHorizontal: 36, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  contTxt:  { color: GOLD, fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1 },
  // ── Body
  body: { paddingHorizontal: 36, paddingBottom: 60 },
  // ── Section pill
  pill:     { backgroundColor: SOFT, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  pillBar:  { width: 3.5, height: 20, backgroundColor: GREEN, borderRadius: 2, marginRight: 8 },
  pillTxt:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase' },
  // ── Stat cards
  statRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, borderRadius: 8, padding: 13, paddingTop: 0 },
  statTop:  { height: 3.5, borderRadius: 2, marginBottom: 11 },
  statLbl:  { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5 },
  statVal:  { fontFamily: 'Helvetica-Bold', fontSize: 18, lineHeight: 1, marginBottom: 4 },
  statChg:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  // ── Tables
  tHead:    { flexDirection: 'row', backgroundColor: GREEN, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 1 },
  tHCell:   { color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 0.5, textTransform: 'uppercase' },
  tRow:     { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7, borderBottomColor: BORDER, borderBottomWidth: 0.5, alignItems: 'center' },
  tRowAlt:  { backgroundColor: '#F7FBF9' },
  tCell:    { fontSize: 8, color: TEXT },
  tBold:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEXT },
  // ── Footer
  footer:   { backgroundColor: INK, paddingHorizontal: 36, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'absolute', bottom: 0, left: 0, right: 0 },
  fBrand:   { color: GOLD, fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, marginBottom: 2 },
  fSub:     { color: 'rgba(255,255,255,0.3)', fontSize: 6.5 },
  fPage:    { color: GOLD, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  fConf:    { color: 'rgba(255,255,255,0.25)', fontSize: 6.5, marginTop: 2 },
});

// ── Revenue SVG Bar Chart ──────────────────────────────────────────────────
function RevenueChart({ data }: { data: Array<{ date: string; revenue: number; orders: number }> }) {
  const W = 523, CH = 95, AY = 95;
  const n = Math.min(data.length, 60);
  const visible = data.slice(-n);
  const gap = n > 25 ? 1.5 : n > 14 ? 2 : 2.5;
  const bw  = Math.max((W - (n - 1) * gap) / n, 3);
  const max = Math.max(...visible.map(d => d.revenue), 1);

  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${CH + 2}`} style={{ width: W, height: CH + 2 }}>
        <G>
          {/* grid lines */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <Line key={f} x1={0} y1={AY - f * CH} x2={W} y2={AY - f * CH}
              stroke={BORDER} strokeWidth={0.5} />
          ))}
          {/* axis */}
          <Line x1={0} y1={AY} x2={W} y2={AY} stroke={MID} strokeWidth={1} />
          {/* bars */}
          {visible.map((d, i) => {
            const bh = Math.max((d.revenue / max) * CH, 1);
            const x  = i * (bw + gap);
            const dt = new Date(d.date + 'T00:00:00');
            const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
            return (
              <Rect key={i} x={x} y={AY - bh} width={bw} height={bh}
                fill={isWeekend ? GOLD : MID} rx={1} ry={1} />
            );
          })}
        </G>
      </Svg>
      {/* x-axis labels */}
      <View style={{ flexDirection: 'row', marginTop: 5 }}>
        {visible.map((d, i) => {
          const show = n <= 7 ? true : n <= 14 ? i % 2 === 0 : n <= 30 ? i % 7 === 0 : i % 14 === 0;
          return (
            <Text key={i} style={{ width: bw + gap, fontSize: 5.5, color: MUTED, textAlign: 'center' }}>
              {show ? shortDate(d.date) : ''}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── Horizontal product bar ──────────────────────────────────────────────────
function ProdBar({ name, revenue, maxRev, rank, totalRev }: {
  name: string; revenue: number; maxRev: number; rank: number; totalRev: number;
}) {
  const MAX_BAR = 190;
  const bw      = maxRev > 0 ? (revenue / maxRev) * MAX_BAR : 0;
  const share   = totalRev > 0 ? ((revenue / totalRev) * 100).toFixed(1) : '0.0';
  const color   = CHART_COLORS[rank % CHART_COLORS.length];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomColor: BORDER, borderBottomWidth: 0.5 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: MID }}>{rank + 1}</Text>
      </View>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEXT }}>
          {name.length > 26 ? name.slice(0, 24) + '..' : name}
        </Text>
      </View>
      <View style={{ width: MAX_BAR, height: 9, backgroundColor: '#EDF2EF', borderRadius: 5, marginRight: 8 }}>
        <View style={{ width: Math.round(bw), height: 9, backgroundColor: color, borderRadius: 5 }} />
      </View>
      <Text style={{ width: 58, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color, textAlign: 'right' }}>
        {fmtCurrency(revenue)}
      </Text>
      <Text style={{ width: 34, fontSize: 7, color: MUTED, textAlign: 'right' }}>{share}%</Text>
    </View>
  );
}

// ── Horizontal payment method bar ──────────────────────────────────────────
function PayBar({ name, value, total, color }: { name: string; value: number; total: number; color: string }) {
  const MAX_BAR = 145;
  const bw  = total > 0 ? (value / total) * MAX_BAR : 0;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 7 }} />
      <Text style={{ flex: 1, fontSize: 7.5, color: TEXT }}>{name}</Text>
      <View style={{ width: MAX_BAR, height: 6, backgroundColor: '#EDF2EF', borderRadius: 3, marginRight: 8 }}>
        <View style={{ width: Math.round(bw), height: 6, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ width: 26, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: TEXT, textAlign: 'right' }}>{value}</Text>
      <Text style={{ width: 34, fontSize: 7, color: MUTED, textAlign: 'right' }}>{pct}%</Text>
    </View>
  );
}

// ── Page footer (fixed to bottom) ──────────────────────────────────────────
function Footer({ page, title }: { page: number; title: string }) {
  return (
    <View style={s.footer} fixed>
      <View>
        <Text style={s.fBrand}>NATURE LITE</Text>
        <Text style={s.fSub}>Admin Panel · Analytics Report</Text>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 7 }}>{title}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.fPage}>Page {page}</Text>
        <Text style={s.fConf}>CONFIDENTIAL</Text>
      </View>
    </View>
  );
}

// ── Continuation header ────────────────────────────────────────────────────
function ContHead({ title, section }: { title: string; section: string }) {
  return (
    <View>
      <View style={s.contGold} />
      <View style={s.contBar}>
        <Text style={s.contTxt}>NATURE LITE  ·  {title.toUpperCase()}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: 0.5 }}>{section.toUpperCase()}</Text>
      </View>
    </View>
  );
}

// ── Section pill ───────────────────────────────────────────────────────────
function Pill({ label, color = GREEN }: { label: string; color?: string }) {
  return (
    <View style={[s.pill, { marginTop: 6 }]}>
      <View style={[s.pillBar, { backgroundColor: color }]} />
      <Text style={[s.pillTxt, { color }]}>{label}</Text>
    </View>
  );
}

// ── KPI stat card ──────────────────────────────────────────────────────────
function KpiCard({ label, value, accent, bg, change }: {
  label: string; value: string | number; accent: string; bg: string; change?: number | null;
}) {
  const v   = String(value);
  const fs  = v.length > 10 ? 13 : v.length > 7 ? 15 : 17;
  const pos = change !== undefined && change !== null && change >= 0;

  return (
    <View style={[s.statCard, { backgroundColor: bg }]}>
      <View style={[s.statTop, { backgroundColor: accent }]} />
      <Text style={[s.statLbl, { color: accent }]}>{label}</Text>
      <Text style={[s.statVal, { color: accent, fontSize: fs }]}>{v}</Text>
      {change !== undefined && change !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <Text style={[s.statChg, { color: pos ? GREEN2 : RED }]}>{signPct(change)}</Text>
          <Text style={{ fontSize: 6.5, color: MUTED, marginLeft: 3 }}>vs prev. period</Text>
        </View>
      )}
    </View>
  );
}

// ── Bullet list item ───────────────────────────────────────────────────────
function Item({ text, color, pre }: { text: string; color: string; pre: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 5 }}>
      <Text style={{ fontSize: 8, color, marginRight: 6, fontFamily: 'Helvetica-Bold' }}>{pre}</Text>
      <Text style={{ flex: 1, fontSize: 8, color: SUB, lineHeight: 1.5 }}>{text}</Text>
    </View>
  );
}

// ── Info box ───────────────────────────────────────────────────────────────
function InfoBox({ label, children, accent, bg }: { label: string; children: React.ReactNode; accent: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: accent, marginBottom: 14 }}>
      <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: accent, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// ── Main Document ──────────────────────────────────────────────────────────
function AnalyticsDocument(props: AnalyticsPdfData) {
  const {
    title, period, fromDate, toDate,
    totalRevenue, totalOrders, avgOrderValue, totalCustomers,
    periodComparison, revenueChartData, dayOfWeekData,
    topProducts, newCustomers, returningCustomers,
    paymentMethods, topCustomers, lowStockItems, narrative,
  } = props;

  const ts  = nowStr();
  const sTitle = title.length > 44 ? title.slice(0, 42) + '..' : title;

  const hasChart    = (revenueChartData?.length ?? 0) > 1;
  const hasProducts = (topProducts?.length ?? 0) > 0;
  const hasPayments = (paymentMethods?.length ?? 0) > 0;
  const hasCust     = (newCustomers ?? 0) > 0 || (returningCustomers ?? 0) > 0;
  const hasLowStk   = (lowStockItems?.length ?? 0) > 0;
  const hasNarr     = !!narrative?.summary;
  const hasTopCust  = (topCustomers?.length ?? 0) > 0;
  const hasP3       = hasProducts || hasCust || hasPayments || hasTopCust;
  const hasP4       = hasLowStk || (narrative?.watchouts?.length ?? 0) > 0 || (narrative?.actions?.length ?? 0) > 0;

  const pmTotal  = paymentMethods?.reduce((s, p) => s + p.value, 0) ?? 0;
  const custTotal = (newCustomers ?? 0) + (returningCustomers ?? 0);

  const bestDay = hasChart
    ? revenueChartData!.reduce((b, d) => d.revenue > b.revenue ? d : b, revenueChartData![0])
    : null;

  const prodTotalRev = topProducts?.reduce((s, p) => s + p.revenue, 0) ?? 0;
  const prodMaxRev   = topProducts ? Math.max(...topProducts.map(p => p.revenue), 1) : 1;

  // ── PAGE 1 ───────────────────────────────────────────────────────────────
  const page1 = (
    <Page size="A4" style={s.page} key="p1">
      <View style={s.goldBar} />

      {/* Dark header */}
      <View style={s.header}>
        <View style={s.dec1} /><View style={s.dec2} /><View style={s.dec3} />
        <View style={s.brandPill}><Text style={s.brandTxt}>NATURE LITE</Text></View>
        <Text style={s.rptLabel}>Admin Panel  ·  Analytics Report  ·  Confidential</Text>
        <Text style={s.hTitle}>{sTitle}</Text>
        <Text style={s.hSub}>{fromDate}  –  {toDate}  ·  {period}</Text>
        <View style={s.hMeta}>
          {[
            { l: 'Period',    v: period },
            { l: 'From',      v: fromDate },
            { l: 'To',        v: toDate },
            { l: 'Generated', v: ts },
          ].map(x => (
            <View key={x.l} style={s.hChip}>
              <Text style={s.hChipLbl}>{x.l}</Text>
              <Text style={s.hChipVal}>{x.v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Gold divider */}
      <View style={{ height: 1, backgroundColor: GOLD, opacity: 0.35 }} />

      <View style={[s.body, { marginTop: 18 }]}>

        {/* KPI row 1 */}
        <View style={s.statRow}>
          <KpiCard label="Total Revenue"   value={fmtCurrency(totalRevenue)} accent={MID}    bg={SOFT}   change={periodComparison?.revenueChange} />
          <KpiCard label="Total Orders"    value={totalOrders}                accent={ORANGE} bg={ORNBG}  change={periodComparison?.ordersChange} />
        </View>
        {/* KPI row 2 */}
        <View style={s.statRow}>
          <KpiCard label="Avg Order Value" value={fmtCurrency(avgOrderValue)} accent={BLUE}   bg={BLUEBG} />
          <KpiCard label="Total Customers" value={totalCustomers}              accent={TEAL}   bg={TEALBG} />
        </View>
        {/* KPI row 3 — optional extras */}
        {(hasCust || hasLowStk) && (
          <View style={s.statRow}>
            {hasCust    && <KpiCard label="New Customers"   value={newCustomers ?? 0}     accent={PURPLE} bg={PURPBG} />}
            {hasLowStk  && <KpiCard label="Low Stock Items" value={lowStockItems!.length}  accent={RED}    bg={REDBG}  />}
            {!(hasCust && hasLowStk) && <View style={{ flex: 1 }} />}
          </View>
        )}

        {/* Narrative summary */}
        {hasNarr && (
          <InfoBox label="Executive Summary" accent={MID} bg={SOFT}>
            <Text style={{ fontSize: 8.5, color: SUB, lineHeight: 1.65 }}>{narrative!.summary}</Text>
          </InfoBox>
        )}

        {/* Highlights */}
        {(narrative?.highlights?.length ?? 0) > 0 && (
          <View style={{ marginTop: 4 }}>
            <Pill label="Key Highlights" color={GREEN2} />
            <View style={{ backgroundColor: GRN2BG, borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: GREEN2 }}>
              {narrative!.highlights.map((h, i) => <Item key={i} text={h} color={GREEN2} pre="▲" />)}
            </View>
          </View>
        )}

        {/* Period comparison detail */}
        {periodComparison && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[
              { label: 'Revenue vs Prev Period', val: periodComparison.revenueChange, unit: '%' },
              { label: 'Orders vs Prev Period',  val: periodComparison.ordersChange,  unit: '%' },
            ].map(c => {
              const pos = c.val >= 0;
              return (
                <View key={c.label} style={{
                  flex: 1, borderRadius: 8, padding: 12,
                  backgroundColor: pos ? GRN2BG : REDBG,
                  borderTopWidth: 3, borderTopColor: pos ? GREEN2 : RED,
                }}>
                  <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    {c.label}
                  </Text>
                  <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: pos ? GREEN2 : RED }}>
                    {signPct(c.val)}
                  </Text>
                  <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
                    Compared to previous {period}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

      </View>
      <Footer page={1} title={sTitle} />
    </Page>
  );

  // ── PAGE 2: Revenue Trend ─────────────────────────────────────────────────
  const page2 = hasChart ? (
    <Page size="A4" style={s.page} key="p2">
      <View style={s.contGold} />
      <ContHead title={sTitle} section="Revenue & Orders Trend" />

      <View style={s.body}>
        <Pill label="Daily Revenue Trend" color={MID} />

        <RevenueChart data={revenueChartData!} />

        {/* Chart legend */}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 6, marginBottom: 16 }}>
          {[
            { label: 'Weekday', color: MID },
            { label: 'Weekend', color: GOLD },
          ].map(l => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, backgroundColor: l.color, borderRadius: 2 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>{l.label} Revenue</Text>
            </View>
          ))}
          <Text style={{ fontSize: 7, color: MUTED, marginLeft: 6 }}>
            Total: {fmtFull(totalRevenue)}  ·  {totalOrders} orders  ·  Avg {fmtCurrency(avgOrderValue)}/order
          </Text>
        </View>

        {/* Stat row */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {[
            { l: 'Total Revenue',    v: fmtFull(totalRevenue),     c: MID,    b: SOFT   },
            { l: 'Total Orders',     v: String(totalOrders),        c: ORANGE, b: ORNBG  },
            { l: 'Avg Order Value',  v: fmtCurrency(avgOrderValue), c: BLUE,   b: BLUEBG },
            ...(bestDay ? [{ l: 'Peak Revenue Day', v: shortDate(bestDay.date), c: GREEN2, b: GRN2BG }] : []),
          ].map(x => (
            <View key={x.l} style={{ flex: 1, backgroundColor: x.b, borderRadius: 6, padding: 10, borderTopWidth: 2.5, borderTopColor: x.c }}>
              <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: x.c, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{x.l}</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: x.c }}>{x.v}</Text>
            </View>
          ))}
        </View>

        {/* Revenue data table */}
        <Pill label="Daily Revenue Breakdown" color={MID} />
        <View style={s.tHead}>
          <Text style={[s.tHCell, { flex: 2 }]}>Date</Text>
          <Text style={[s.tHCell, { flex: 1, textAlign: 'right' }]}>Orders</Text>
          <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Revenue</Text>
          <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Avg / Order</Text>
        </View>
        {revenueChartData!.slice(-22).map((d, i) => (
          <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
            <Text style={[s.tCell,  { flex: 2 }]}>{shortDate(d.date)}</Text>
            <Text style={[s.tCell,  { flex: 1, textAlign: 'right' }]}>{d.orders}</Text>
            <Text style={[s.tBold,  { flex: 2, textAlign: 'right', color: MID }]}>{fmtFull(d.revenue)}</Text>
            <Text style={[s.tCell,  { flex: 2, textAlign: 'right' }]}>
              {d.orders > 0 ? fmtCurrency(d.revenue / d.orders) : '—'}
            </Text>
          </View>
        ))}

        {/* Day-of-week pattern */}
        {(dayOfWeekData?.length ?? 0) > 0 && (
          <View style={{ marginTop: 20 }}>
            <Pill label="Day-of-Week Revenue Pattern" color={GOLD} />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              {dayOfWeekData!.map(d => {
                const maxAvg = Math.max(...dayOfWeekData!.map(x => x.avgRevenue), 1);
                const bh = Math.max((d.avgRevenue / maxAvg) * 64, 2);
                const isWknd = d.day === 'Sat' || d.day === 'Sun';
                return (
                  <View key={d.day} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ height: 64, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                      <View style={{ width: '80%', height: bh, backgroundColor: isWknd ? GOLD : MID, borderRadius: 2 }} />
                    </View>
                    <Text style={{ fontSize: 7, color: MUTED, marginTop: 4 }}>{d.day}</Text>
                    <Text style={{ fontSize: 6, color: isWknd ? ORANGE : MID, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>
                      {fmtCurrency(d.avgRevenue)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
      <Footer page={2} title={sTitle} />
    </Page>
  ) : null;

  // ── PAGE 3: Products & Customers ──────────────────────────────────────────
  const page3 = hasP3 ? (
    <Page size="A4" style={s.page} key="p3">
      <View style={s.contGold} />
      <ContHead title={sTitle} section="Products & Customers" />

      <View style={s.body}>

        {/* Top Products */}
        {hasProducts && (
          <View>
            <Pill label="Top Selling Products" color={MID} />
            {/* column headers */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 4, marginBottom: 3 }}>
              <View style={{ width: 28 }} />
              <Text style={{ flex: 1, fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Product</Text>
              <Text style={{ width: 198, fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>Revenue Bar</Text>
              <Text style={{ width: 58, fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', textAlign: 'right' }}>Revenue</Text>
              <Text style={{ width: 34, fontSize: 6.5, color: MUTED, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', textAlign: 'right' }}>Share</Text>
            </View>
            {topProducts!.slice(0, 8).map((p, i) => (
              <ProdBar key={i} name={p.name} revenue={p.revenue} maxRev={prodMaxRev} rank={i} totalRev={prodTotalRev} />
            ))}

            {/* products table */}
            <View style={{ marginTop: 14 }}>
              <View style={s.tHead}>
                <Text style={[s.tHCell, { width: 18 }]}>#</Text>
                <Text style={[s.tHCell, { flex: 4 }]}>Product</Text>
                <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Units Sold</Text>
                <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Revenue</Text>
              </View>
              {topProducts!.slice(0, 10).map((p, i) => (
                <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { width: 18, color: MUTED }]}>{i + 1}</Text>
                  <Text style={[s.tBold, { flex: 4 }]}>{p.name.length > 34 ? p.name.slice(0, 32) + '..' : p.name}</Text>
                  <Text style={[s.tCell, { flex: 2, textAlign: 'right' }]}>{p.sold}</Text>
                  <Text style={[s.tBold, { flex: 2, textAlign: 'right', color: MID }]}>{fmtFull(p.revenue)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Customer analytics */}
        {(hasCust || hasPayments) && (
          <View style={{ marginTop: 16 }}>
            <Pill label="Customer Analytics" color={BLUE} />
            <View style={{ flexDirection: 'row', gap: 10 }}>

              {/* New vs Returning */}
              {hasCust && (
                <View style={{ flex: 1, backgroundColor: BLUEBG, borderRadius: 8, padding: 12, borderTopWidth: 3, borderTopColor: BLUE }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: BLUE, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Customer Split
                  </Text>
                  {[
                    { label: 'New',       val: newCustomers ?? 0,       color: BLUE },
                    { label: 'Returning', val: returningCustomers ?? 0, color: MID  },
                  ].map(x => {
                    const pct  = custTotal > 0 ? x.val / custTotal : 0;
                    const barW = Math.round(pct * 140);
                    return (
                      <View key={x.label} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: x.color }}>{x.label}</Text>
                          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: x.color }}>
                            {x.val} ({(pct * 100).toFixed(0)}%)
                          </Text>
                        </View>
                        <View style={{ height: 7, backgroundColor: '#D1E4FF', borderRadius: 4 }}>
                          <View style={{ width: barW, height: 7, backgroundColor: x.color, borderRadius: 4 }} />
                        </View>
                      </View>
                    );
                  })}
                  <Text style={{ fontSize: 7, color: MUTED, marginTop: 4 }}>
                    Total active: {custTotal}
                  </Text>
                </View>
              )}

              {/* Payment methods */}
              {hasPayments && (
                <View style={{ flex: 1.5, backgroundColor: SOFT, borderRadius: 8, padding: 12, borderTopWidth: 3, borderTopColor: MID }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREEN, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Payment Methods
                  </Text>
                  {paymentMethods!.map((pm, i) => (
                    <PayBar key={i} name={pm.name} value={pm.value} total={pmTotal} color={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                  <Text style={{ fontSize: 7, color: MUTED, marginTop: 4 }}>
                    Total orders: {pmTotal}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Top Customers */}
        {hasTopCust && (
          <View style={{ marginTop: 16 }}>
            <Pill label="Top Customers" color={TEAL} />
            <View style={s.tHead}>
              <Text style={[s.tHCell, { width: 18 }]}>#</Text>
              <Text style={[s.tHCell, { flex: 4 }]}>Customer</Text>
              <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Orders</Text>
              <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Total Spent</Text>
            </View>
            {topCustomers!.slice(0, 8).map((c, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.tCell, { width: 18, color: MUTED }]}>{i + 1}</Text>
                <Text style={[s.tBold, { flex: 4 }]}>{c.name.length > 34 ? c.name.slice(0, 32) + '..' : c.name}</Text>
                <Text style={[s.tCell, { flex: 2, textAlign: 'right' }]}>{c.totalOrders}</Text>
                <Text style={[s.tBold, { flex: 2, textAlign: 'right', color: TEAL }]}>{fmtFull(c.totalSpent)}</Text>
              </View>
            ))}
          </View>
        )}

      </View>
      <Footer page={3} title={sTitle} />
    </Page>
  ) : null;

  // ── PAGE 4: Inventory & Recommendations ──────────────────────────────────
  const page4 = hasP4 ? (
    <Page size="A4" style={s.page} key="p4">
      <View style={s.contGold} />
      <ContHead title={sTitle} section="Inventory & Recommendations" />

      <View style={s.body}>

        {/* Low stock table */}
        {hasLowStk && (
          <View>
            <Pill label={`Low Stock Alerts  —  ${lowStockItems!.length} item${lowStockItems!.length !== 1 ? 's' : ''}`} color={RED} />

            <InfoBox label="Inventory Alert" accent={RED} bg={REDBG}>
              <Text style={{ fontSize: 8, color: '#7F1D1D', lineHeight: 1.55 }}>
                {lowStockItems!.length} product{lowStockItems!.length !== 1 ? 's are' : ' is'} running
                low on stock. Immediate restocking is recommended to avoid fulfillment issues.
              </Text>
            </InfoBox>

            <View style={s.tHead}>
              <Text style={[s.tHCell, { width: 18 }]}>#</Text>
              <Text style={[s.tHCell, { flex: 5 }]}>Product Name</Text>
              <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Stock</Text>
              <Text style={[s.tHCell, { flex: 2, textAlign: 'right' }]}>Status</Text>
            </View>

            {lowStockItems!.slice(0, 20).map((item, i) => {
              const crit = item.stock <= 0;
              return (
                <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, { width: 18, color: MUTED }]}>{i + 1}</Text>
                  <Text style={[s.tBold, { flex: 5 }]}>{item.name.length > 36 ? item.name.slice(0, 34) + '..' : item.name}</Text>
                  <Text style={[s.tBold, { flex: 2, textAlign: 'right', color: crit ? RED : ORANGE }]}>
                    {item.stock} units
                  </Text>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: crit ? REDBG : ORNBG, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderColor: crit ? RED : ORANGE, borderWidth: 0.5 }}>
                      <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: crit ? RED : ORANGE }}>
                        {crit ? 'OUT OF STOCK' : 'LOW STOCK'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Watchouts */}
        {(narrative?.watchouts?.length ?? 0) > 0 && (
          <View style={{ marginTop: 16 }}>
            <Pill label="Watch Out" color={ORANGE} />
            <InfoBox label="Areas to Monitor" accent={ORANGE} bg={ORNBG}>
              {narrative!.watchouts.map((w, i) => <Item key={i} text={w} color={ORANGE} pre="!" />)}
            </InfoBox>
          </View>
        )}

        {/* Recommended actions */}
        {(narrative?.actions?.length ?? 0) > 0 && (
          <View style={{ marginTop: 4 }}>
            <Pill label="Recommended Actions" color={GREEN2} />
            <InfoBox label="Action Items" accent={GREEN2} bg={GRN2BG}>
              {narrative!.actions.map((a, i) => <Item key={i} text={a} color={GREEN2} pre={`${i + 1}.`} />)}
            </InfoBox>
          </View>
        )}

        {/* Confidentiality footer */}
        <View style={{ marginTop: 18, backgroundColor: ORNBG, borderRadius: 8, padding: 14, borderLeftWidth: 3, borderLeftColor: GOLD }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#78350F', marginBottom: 4 }}>
            Confidential Business Report
          </Text>
          <Text style={{ fontSize: 7.5, color: '#92400E', lineHeight: 1.6 }}>
            This report contains sensitive business data. Do not forward or share with unauthorized
            parties. Store securely and delete when no longer required.{'\n'}
            Generated by Nature Lite Admin Panel — {ts}
          </Text>
        </View>

      </View>
      <Footer page={4} title={sTitle} />
    </Page>
  ) : null;

  return (
    <Document>
      {page1}
      {page2}
      {page3}
      {page4}
    </Document>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────
export async function generateAnalyticsPdfBase64(data: AnalyticsPdfData): Promise<string> {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(React.createElement(AnalyticsDocument, data)).toBlob();
  const buf  = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:application/pdf;base64,' + btoa(bin);
}
