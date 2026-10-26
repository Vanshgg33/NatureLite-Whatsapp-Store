'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BarChart3, Trophy, TrendingUp, AlertTriangle, Users, PhoneCall, Phone, CheckCircle2, Activity, Repeat2, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, segmentLabel } from '@/lib/crm/format';
import { useAdminAuthStore } from '@/lib/admin-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEGMENT_ORDER = ['new', 'active', 'due_soon', 'due_today', 'overdue', 'at_risk', 'dormant', 'lost'];
const SEG_COLORS: Record<string, string> = {
  new: 'var(--crm-blue)',   active: 'var(--crm-success)',
  due_soon: '#F59E0B',      due_today: 'var(--crm-amber)',
  overdue: 'var(--crm-danger)', at_risk: '#F97316',
  dormant: 'var(--crm-muted)', lost: 'var(--crm-line)',
};
const OUTCOME_COLORS: Record<string, string> = {
  converted: 'var(--crm-success)', callback: 'var(--crm-blue)',
  interested: 'var(--crm-amber)',  not_interested: 'var(--crm-muted)',
  no_answer: 'var(--crm-muted)',   wrong_number: 'var(--crm-danger)',
};
const RANK_STYLES = [
  { bg: '#FEF3C7', color: '#92400E', ring: '#D97706' },
  { bg: '#F3F4F6', color: '#4B5563', ring: '#9CA3AF' },
  { bg: '#FFF7ED', color: '#9A3412', ring: '#F97316' },
];

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-7 w-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, accent, delay = 0 }: {
  label: string; value: string; sub?: string; icon: any; accent: string; delay?: number;
}) {
  return (
    <div className="crm-card-v2 overflow-hidden crm-count-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}60)` }} />
      <div className="p-5">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center mb-3"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <p
          className="text-3xl font-semibold leading-none mb-1.5"
          style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)', color: 'var(--crm-ink)' }}
        >
          {value}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{label}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'leaderboard' | 'agents' | 'live';

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading } = useQuery({ queryKey: ['crm-analytics'], queryFn: () => api.getCrmAnalytics() });
  if (isLoading) return <Spinner />;

  const segs: { segment: string; count: number }[] = data?.segmentBreakdown ?? [];
  const segsOrdered = SEGMENT_ORDER
    .map(s => ({ segment: s, count: segs.find((x: any) => x.segment === s)?.count ?? 0 }))
    .filter(s => s.count > 0);
  const maxSeg = Math.max(...segsOrdered.map(s => s.count), 1);
  const totalSeg = segsOrdered.reduce((a, b) => a + b.count, 0);

  return (
    <div className="p-7 space-y-6">
      {/* KPIs */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--crm-muted)' }}>Key Metrics</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total Customers" value={String(data?.totalCustomers ?? 0)} icon={Users} accent="var(--crm-forest)" delay={0} />
          <KpiCard label="Repeat Rate" value={`${data?.repeatRate ?? 0}%`} sub="2+ orders" icon={TrendingUp} accent="var(--crm-success)" delay={50} />
          <KpiCard label="Calls This Month" value={String(data?.callsLast30 ?? data?.callsThisMonth ?? 0)} icon={PhoneCall} accent="var(--crm-amber)" delay={100} />
          <KpiCard label="Revenue at Risk" value={formatINR(data?.revenueAtRisk ?? 0)} sub="At Risk + Dormant" icon={AlertTriangle} accent="var(--crm-danger)" delay={150} />
        </div>
      </div>

      {/* Segment breakdown */}
      <div className="crm-card-v2 p-6 crm-count-in" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Customer Segments</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
              {totalSeg} customers across {segsOrdered.length} segments
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {segsOrdered.map(({ segment, count }) => {
            const color = SEG_COLORS[segment] ?? 'var(--crm-muted)';
            const pct = Math.round((count / totalSeg) * 100);
            return (
              <div key={segment}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--crm-ink)' }}>{segmentLabel(segment)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-mono" style={{ color: 'var(--crm-muted)' }}>{count}</span>
                    <span className="text-[11px] font-bold w-8 text-right" style={{ color }}>{pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(count / maxSeg) * 100}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {segsOrdered.length > 0 && (
          <div className="mt-5 flex rounded-full overflow-hidden h-2.5" style={{ background: 'var(--crm-sand-2)' }}>
            {segsOrdered.map(({ segment, count }) => (
              <div
                key={segment}
                className="h-full transition-all duration-700"
                style={{ width: `${(count / totalSeg) * 100}%`, background: SEG_COLORS[segment] ?? 'var(--crm-muted)' }}
                title={`${segment}: ${count}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Conversion funnel */}
      {data?.funnelStats && (
        <div className="crm-card-v2 p-6 crm-count-in" style={{ animationDelay: '280ms' }}>
          <h2 className="text-[15px] font-semibold mb-5" style={{ color: 'var(--crm-ink)' }}>Call Outcome Funnel</h2>
          <div className="space-y-2.5">
            {Object.entries(data.funnelStats as Record<string, number>).map(([outcome, count], idx) => {
              const max = Math.max(...Object.values(data.funnelStats as Record<string, number>), 1);
              const color = OUTCOME_COLORS[outcome] ?? 'var(--crm-muted)';
              return (
                <div key={outcome} className="flex items-center gap-3" style={{ animationDelay: `${idx * 30}ms` }}>
                  <p className="text-[12px] w-28 text-right font-medium capitalize" style={{ color: 'var(--crm-ink-2)' }}>
                    {outcome.replace(/_/g, ' ')}
                  </p>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} />
                  </div>
                  <p
                    className="text-[13px] font-semibold w-10 text-right crm-tabular"
                    style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)', color: 'var(--crm-ink)' }}
                  >
                    {count}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard tab ──────────────────────────────────────────────────────────

function LeaderboardTab() {
  const { data = [], isLoading } = useQuery({ queryKey: ['crm-leaderboard'], queryFn: () => api.getCrmLeaderboard() });
  if (isLoading) return <Spinner />;

  return (
    <div className="p-7 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--crm-muted)' }}>
        Last 30 days · ranked by conversions
      </p>
      {!(data as any[]).length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Trophy className="h-10 w-10 mb-4" style={{ color: 'var(--crm-line)' }} />
          <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>No activity yet</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--crm-muted)' }}>Leaderboard fills as agents log calls</p>
        </div>
      ) : (data as any[]).map((entry: any, i: number) => {
        const rank = i + 1;
        const rs = RANK_STYLES[i] ?? { bg: 'var(--crm-sand)', color: 'var(--crm-muted)', ring: 'var(--crm-line)' };
        const convRate = entry.totalCalls > 0 ? Math.round((entry.conversions / entry.totalCalls) * 100) : 0;
        const initials = (entry.agent?.name ?? 'A').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
        const maxConv = Math.max(...(data as any[]).map((d: any) => d.conversions ?? 0), 1);

        return (
          <div
            key={entry.agent?._id ?? i}
            className="crm-card-v2 crm-count-in"
            style={{
              border: i < 3 ? `1px solid ${rs.ring}60` : undefined,
              boxShadow: i === 0 ? '0 4px 16px rgba(212,160,23,0.1)' : undefined,
              animationDelay: `${i * 40}ms`,
            }}
          >
            <div className="flex items-center gap-4 p-4">
              {/* Rank */}
              <div className="flex-shrink-0 w-8">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                  style={{ background: rs.bg, color: rs.color, border: `1.5px solid ${rs.ring}50` }}
                >
                  {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </div>
              </div>

              {/* Avatar */}
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{
                  background: i === 0 ? 'var(--crm-forest)' : 'var(--crm-sand-2)',
                  color: i === 0 ? 'var(--crm-gold)' : 'var(--crm-amber)',
                }}
              >
                {initials}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[14px] truncate" style={{ color: 'var(--crm-ink)' }}>
                  {entry.agent?.name ?? 'Unknown'}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--crm-muted)' }}>
                  {({ crm_head: 'CRM Head', crm_manager: 'CRM Manager', crm_senior: 'Senior Agent', crm_viewer: 'Viewer' } as Record<string, string>)[entry.agent?.departmentType] ?? 'Agent'}
                </p>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-0" style={{ borderLeft: '1px solid var(--crm-line)', paddingLeft: 16 }}>
                {[
                  { label: 'Calls',    value: entry.totalCalls ?? 0,  icon: Phone,       color: 'var(--crm-amber)' },
                  { label: 'Conv.',    value: entry.conversions ?? 0,  icon: CheckCircle2, color: 'var(--crm-success)' },
                  { label: 'Winbacks', value: entry.winbacks ?? 0,     icon: Repeat2,      color: 'var(--crm-blue)' },
                  { label: 'Rate',     value: `${convRate}%`,          icon: TrendingUp,   color: 'var(--crm-blue)' },
                ].map((s, si) => (
                  <div key={s.label} className="flex items-center">
                    {si > 0 && <div className="w-px h-8 flex-shrink-0" style={{ background: 'var(--crm-line)', margin: '0 0px' }} />}
                    <div className="flex flex-col items-center gap-0.5 px-4">
                      <div className="flex items-center gap-1 mb-0.5">
                        <s.icon className="h-3 w-3" style={{ color: s.color }} />
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--crm-muted)' }}>{s.label}</p>
                      </div>
                      <p
                        className="text-[15px] font-semibold crm-tabular"
                        style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)', color: 'var(--crm-ink)' }}
                      >
                        {s.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bar */}
              <div className="w-20 hidden sm:block">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((entry.conversions ?? 0) / maxConv) * 100}%`,
                      background: i === 0 ? 'linear-gradient(90deg, var(--crm-amber), var(--crm-gold))' : 'var(--crm-line)',
                    }}
                  />
                </div>
                <p className="text-[10px] mt-1 text-right font-medium" style={{ color: 'var(--crm-muted)' }}>
                  {entry.conversions ?? 0} conv
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab() {
  const { data = [], isLoading } = useQuery({ queryKey: ['crm-employees'], queryFn: () => api.getCrmEmployees() });
  if (isLoading) return <Spinner />;

  return (
    <div className="p-7 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--crm-muted)' }}>
        All CRM team members
      </p>
      {!(data as any[]).length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-10 w-10 mb-4" style={{ color: 'var(--crm-line)' }} />
          <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>No agents yet</p>
        </div>
      ) : (data as any[]).map((emp: any) => (
        <Link
          key={emp._id}
          href={`/crm/admin/employees/${emp._id}`}
          className="crm-card-v2 flex items-center gap-4 p-4 transition-opacity hover:opacity-80 block"
        >
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
            style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
          >
            {(emp.name?.[0] ?? 'A').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px]" style={{ color: 'var(--crm-ink)' }}>{emp.name}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
              {emp.departmentType?.replace(/_/g, ' ')} · {emp.loginId ?? emp.email}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={emp.isActive
                ? { background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }
                : { background: 'var(--crm-sand-2)', color: 'var(--crm-muted)' }
              }
            >
              {emp.isActive ? 'Active' : 'Disabled'}
            </span>
            <Activity className="h-4 w-4" style={{ color: 'var(--crm-muted)' }} />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Live View tab ────────────────────────────────────────────────────────────

function LiveTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-live'],
    queryFn: () => api.getCrmLiveView(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Spinner />;

  const agents = data as any[];

  return (
    <div className="p-7">
      <div className="flex items-center gap-2 mb-5">
        <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--crm-success)' }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--crm-muted)' }}>
          Online now · refreshes every 30s
        </p>
      </div>
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="h-10 w-10 mb-4" style={{ color: 'var(--crm-line)' }} />
          <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>No one online</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>Agents appear here when active in the last 5 minutes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((a: any) => (
            <div key={a.agentId} className="crm-card-v2 flex items-center gap-4 p-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}>
                {(a.name?.[0] ?? 'A').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[14px]" style={{ color: 'var(--crm-ink)' }}>{a.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
                  {a.lastAction?.replace(/_/g, ' ')} · {new Date(a.lastSeenAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-center">
                  <p className="text-[18px] font-semibold leading-none" style={{ color: 'var(--crm-ink)' }}>{a.todayCalls}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: 'var(--crm-muted)' }}>calls</p>
                </div>
                <div className="text-center">
                  <p className="text-[18px] font-semibold leading-none" style={{ color: 'var(--crm-success)' }}>{a.todayConversions}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: 'var(--crm-muted)' }}>conv</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CRM_ADMIN_ROLES = new Set(['crm_head', 'crm_manager', 'superadmin']);

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAdminAuthStore();
  const isCrmAdmin = CRM_ADMIN_ROLES.has(user?.departmentType ?? user?.role ?? '');
  const tab: Tab = (searchParams.get('tab') as Tab) ?? 'overview';

  const setTab = (t: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/crm/analytics?${params.toString()}`);
  };

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 pt-5 pb-0">
          <div className="flex items-center gap-2.5 mb-4">
            <BarChart3 className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
            <h1
              className="text-[20px] font-semibold"
              style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
            >
              Performance
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex">
            {([
              { key: 'overview',    label: 'Overview',    icon: BarChart3,  adminOnly: false },
              { key: 'leaderboard', label: 'Leaderboard', icon: Trophy,     adminOnly: false },
              { key: 'agents',      label: 'Agents',      icon: Users,      adminOnly: true  },
              { key: 'live',        label: 'Live',        icon: Radio,      adminOnly: true  },
            ] as const).filter(t => !t.adminOnly || isCrmAdmin).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium transition-all"
                style={tab === t.key
                  ? { color: 'var(--crm-ink)', borderBottom: '2px solid var(--crm-gold)', background: 'var(--crm-amber-bg)' }
                  : { color: 'var(--crm-muted)' }}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'overview' ? <OverviewTab /> : tab === 'leaderboard' ? <LeaderboardTab /> : tab === 'live' ? <LiveTab /> : <AgentsTab />}
    </div>
  );
}
