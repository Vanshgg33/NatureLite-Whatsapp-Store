'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, RefreshCw, Clock, Save, AlertTriangle, Star, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ icon: Icon, iconColor, title, sub, children, delay = 0 }: {
  icon: any; iconColor: string; title: string; sub: string; children: React.ReactNode; delay?: number;
}) {
  return (
    <div className="crm-card-v2 p-6 crm-count-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-3 mb-1">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${iconColor} 12%, transparent)` }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <h2 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>{title}</h2>
      </div>
      <p className="text-[12px] mb-5 ml-11" style={{ color: 'var(--crm-muted)' }}>{sub}</p>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, min = 1, max = 9999, suffix = 'days' }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
      <label className="flex-1 text-[13px] font-medium" style={{ color: 'var(--crm-ink)' }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 px-2.5 py-1.5 rounded-lg text-[13px] text-right focus:outline-none transition-colors"
          style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-paper)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--crm-gold)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--crm-line)')}
        />
        <span className="text-[12px] w-8" style={{ color: 'var(--crm-muted)' }}>{suffix}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CrmSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cycles, setCycles]         = useState<Record<string, number>>({});
  const [fallback, setFallback]     = useState(30);
  const [thresholds, setThresholds] = useState({ atRiskAfterDays: 14, dormantAfterDays: 60, lostAfterDays: 120 });
  const [vip, setVip]               = useState({ minOrders: 5, minLifetimeValue: 5000 });
  const [callTarget, setCallTarget] = useState(20);

  const { data, isLoading } = useQuery({ queryKey: ['crm-settings'], queryFn: () => api.getCrmSettings() });

  useEffect(() => {
    if (!data) return;
    if (data.reorderCycles)  setCycles(data.reorderCycles);
    if (data.fallbackCycleDays != null) setFallback(data.fallbackCycleDays);
    if (data.thresholds)     setThresholds(data.thresholds);
    if (data.vip)            setVip(data.vip);
    if (data.dailyCallTarget != null) setCallTarget(data.dailyCallTarget);
  }, [data]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => api.updateCrmSettings({
      reorderCycles: cycles,
      fallbackCycleDays: fallback,
      thresholds,
      vip,
      dailyCallTarget: callTarget,
    }),
    onSuccess: () => { toast({ title: 'Settings saved' }); qc.invalidateQueries({ queryKey: ['crm-settings'] }); },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const { mutate: refresh, isPending: refreshing } = useMutation({
    mutationFn: () => api.triggerCrmRefresh(),
    onSuccess: () => toast({ title: 'Refresh started — runs in background' }),
  });

  const spinner = (
    <div className="flex justify-center py-8">
      <div className="h-6 w-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Settings className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
              <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}>
                CRM Settings
              </h1>
            </div>
            <button
              onClick={() => save()}
              disabled={saving || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
          <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>Engine configuration and manual controls</p>
        </div>
      </div>

      <div className="p-7 max-w-2xl space-y-4">
        {/* Reorder cycles */}
        <Section icon={Clock} iconColor="var(--crm-gold)" title="Default Reorder Cycles" delay={0}
          sub="Days between expected reorders per category. Used when a customer has fewer than 3 orders."
        >
          {isLoading ? spinner : (
            <div className="space-y-2">
              {Object.entries(cycles).map(([cat, days]) => (
                <NumField
                  key={cat}
                  label={cat}
                  value={days}
                  onChange={v => setCycles(c => ({ ...c, [cat]: v }))}
                />
              ))}
              {!Object.keys(cycles).length && (
                <p className="text-[13px] text-center py-4" style={{ color: 'var(--crm-muted)' }}>No categories configured</p>
              )}
            </div>
          )}
        </Section>

        {/* Fallback cycle */}
        <Section icon={Clock} iconColor="var(--crm-amber)" title="Fallback Cycle" delay={40}
          sub="Default reorder days used when no category-specific cycle is set."
        >
          {isLoading ? spinner : (
            <NumField label="Fallback cycle days" value={fallback} onChange={setFallback} />
          )}
        </Section>

        {/* Segment thresholds */}
        <Section icon={AlertTriangle} iconColor="var(--crm-danger)" title="Segment Thresholds" delay={80}
          sub="Days past predicted reorder date that trigger segment escalation."
        >
          {isLoading ? spinner : (
            <div className="space-y-2">
              <NumField label="At Risk after"  value={thresholds.atRiskAfterDays}  onChange={v => setThresholds(t => ({ ...t, atRiskAfterDays: v }))} />
              <NumField label="Dormant after"  value={thresholds.dormantAfterDays} onChange={v => setThresholds(t => ({ ...t, dormantAfterDays: v }))} />
              <NumField label="Lost after"     value={thresholds.lostAfterDays}    onChange={v => setThresholds(t => ({ ...t, lostAfterDays: v }))} />
            </div>
          )}
        </Section>

        {/* VIP thresholds */}
        <Section icon={Star} iconColor="var(--crm-gold)" title="VIP Qualification" delay={120}
          sub="Customers meeting both thresholds are marked VIP."
        >
          {isLoading ? spinner : (
            <div className="space-y-2">
              <NumField label="Min orders"        value={vip.minOrders}        onChange={v => setVip(s => ({ ...s, minOrders: v }))} suffix="orders" min={1} max={999} />
              <NumField label="Min lifetime value" value={vip.minLifetimeValue} onChange={v => setVip(s => ({ ...s, minLifetimeValue: v }))} suffix="₹" min={0} max={9999999} />
            </div>
          )}
        </Section>

        {/* Daily call target */}
        <Section icon={Target} iconColor="var(--crm-blue)" title="Daily Call Target" delay={160}
          sub="Expected calls per agent per day. Shown on the Today dashboard progress ring."
        >
          {isLoading ? spinner : (
            <NumField label="Target calls per day" value={callTarget} onChange={setCallTarget} suffix="calls" min={1} max={200} />
          )}
        </Section>

        {/* Manual refresh */}
        <Section icon={RefreshCw} iconColor="var(--crm-blue)" title="Manual Engine Refresh" delay={200}
          sub="Recalculate segments and predicted reorder dates for all customers. Runs automatically at 2 AM IST."
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => refresh()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-all"
              style={{ background: 'var(--crm-blue-bg)', color: 'var(--crm-blue)', border: '1px solid color-mix(in srgb, var(--crm-blue) 30%, transparent)' }}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Starting…' : 'Trigger Refresh'}
            </button>
            <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>Last auto-run: 2:00 AM IST daily</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
