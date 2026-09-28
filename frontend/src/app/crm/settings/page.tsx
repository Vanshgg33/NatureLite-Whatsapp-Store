'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, RefreshCw, Clock, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function CrmSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cycles, setCycles] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({ queryKey: ['crm-settings'], queryFn: () => api.getCrmSettings() });

  useEffect(() => { if (data?.reorderCycles) setCycles(data.reorderCycles); }, [data]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => api.updateCrmSettings(cycles),
    onSuccess: () => { toast({ title: 'Settings saved' }); qc.invalidateQueries({ queryKey: ['crm-settings'] }); },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const { mutate: refresh, isPending: refreshing } = useMutation({
    mutationFn: () => api.triggerCrmRefresh(),
    onSuccess: () => toast({ title: 'Refresh started — runs in background' }),
  });

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      <div className="bg-white px-7 py-5" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <h1 className="text-xl font-semibold flex items-center gap-2.5" style={{ color: '#1C1917' }}>
          <Settings className="h-5 w-5" style={{ color: '#D4A017' }} />
          CRM Settings
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>Engine configuration and manual controls</p>
      </div>

      <div className="p-7 max-w-xl space-y-4">
        {/* Reorder cycles */}
        <div className="bg-white rounded-xl p-6 crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,160,23,0.1)' }}>
              <Clock className="h-4 w-4" style={{ color: '#D4A017' }} />
            </div>
            <h2 className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>Default Reorder Cycles</h2>
          </div>
          <p className="text-[12px] mb-5 ml-11" style={{ color: '#A09A93' }}>
            Days between expected reorders per category. Used when a customer has fewer than 3 orders.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(cycles).map(([cat, days]) => (
                <div key={cat} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: '#FAFAF8', border: '1px solid #F0EDE7' }}>
                  <label className="flex-1 text-[13px] font-medium" style={{ color: '#1C1917' }}>{cat}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={days}
                      onChange={e => setCycles(c => ({ ...c, [cat]: Number(e.target.value) }))}
                      className="w-16 px-2.5 py-1.5 rounded-lg text-[13px] text-right focus:outline-none transition-colors"
                      style={{ border: '1px solid #E8E2D9', color: '#1C1917', background: 'white' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#D4A017')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#E8E2D9')}
                    />
                    <span className="text-[12px]" style={{ color: '#A09A93' }}>days</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => save()}
            disabled={saving || isLoading}
            className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
            style={{ background: '#1A3625', color: '#D4A017' }}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Cycles'}
          </button>
        </div>

        {/* Manual refresh */}
        <div className="bg-white rounded-xl p-6 crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', animationDelay: '60ms' }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.08)' }}>
              <RefreshCw className="h-4 w-4" style={{ color: '#2563EB' }} />
            </div>
            <h2 className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>Manual Engine Refresh</h2>
          </div>
          <p className="text-[12px] mb-5 ml-11" style={{ color: '#A09A93' }}>
            Recalculate segments and predicted reorder dates for all customers. Runs automatically at 2 AM IST.
          </p>
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-all"
            style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Starting…' : 'Trigger Refresh'}
          </button>
          <p className="text-[11px] mt-3" style={{ color: '#D1CAC2' }}>Last auto-run: 2:00 AM IST daily</p>
        </div>
      </div>
    </div>
  );
}
