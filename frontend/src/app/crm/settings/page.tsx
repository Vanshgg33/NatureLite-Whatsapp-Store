// frontend/src/app/crm/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function CrmSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cycles, setCycles] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['crm-settings'],
    queryFn: () => api.getCrmSettings(),
  });

  useEffect(() => {
    if (data?.reorderCycles) setCycles(data.reorderCycles);
  }, [data]);

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
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Settings className="h-5 w-5 text-[#D4A017]" /> CRM Settings</h1>
      </div>
      <div className="p-5 max-w-lg space-y-6">
        {/* Reorder cycles */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Default Reorder Cycles</h2>
          <p className="text-[12px] text-gray-500 mb-4">Days between expected reorders per category. Used when a customer has fewer than 3 orders.</p>
          {isLoading ? <div className="h-6 w-6 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" /> : (
            <div className="space-y-3">
              {Object.entries(cycles).map(([cat, days]) => (
                <div key={cat} className="flex items-center gap-3">
                  <label className="flex-1 text-sm text-gray-700">{cat}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={days}
                      onChange={e => setCycles(c => ({ ...c, [cat]: Number(e.target.value) }))}
                      className="w-20 border border-gray-200 rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
                    />
                    <span className="text-[12px] text-gray-400">days</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => save()}
            disabled={saving || isLoading}
            className="mt-4 w-full py-2 rounded-md bg-[#1A3625] text-white text-sm font-medium hover:bg-[#1A3625]/90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Cycles'}
          </button>
        </div>

        {/* Manual refresh */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Manual Engine Refresh</h2>
          <p className="text-[12px] text-gray-500 mb-4">Recalculate segments and predicted reorder dates for all customers. Runs automatically at 2 AM IST.</p>
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Starting…' : 'Trigger Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
