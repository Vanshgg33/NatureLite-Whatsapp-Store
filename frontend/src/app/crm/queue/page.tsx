// frontend/src/app/crm/queue/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageCircle, ListTodo, Clock, AlertTriangle, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'today', label: 'Due Today', icon: Clock, color: 'text-amber-600' },
  { key: 'overdue', label: 'Overdue', icon: Flame, color: 'text-red-600' },
  { key: 'at_risk', label: 'At Risk', icon: AlertTriangle, color: 'text-orange-600' },
  { key: 'upcoming', label: 'Upcoming', icon: ListTodo, color: 'text-blue-600' },
] as const;

const SEGMENT_COLORS: Record<string, string> = {
  'New': 'bg-blue-50 text-blue-700',
  'Active': 'bg-green-50 text-green-700',
  'Due Soon': 'bg-amber-50 text-amber-700',
  'Overdue': 'bg-red-50 text-red-700',
  'At Risk': 'bg-orange-50 text-orange-700',
  'Dormant': 'bg-gray-100 text-gray-600',
  'Lost': 'bg-gray-50 text-gray-400',
};

const OUTCOME_OPTIONS = [
  { value: 'connected', label: 'Connected' },
  { value: 'ordered', label: 'Ordered ✓' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback' },
];

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN');
}

function CustomerRow({ item, onLogCall }: { item: any; onLogCall: (id: string) => void }) {
  const daysOverdue = item.predictedReorderDate
    ? Math.round((Date.now() - new Date(item.predictedReorderDate).getTime()) / 86400000)
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900">{item.user?.name ?? item.user?.phone ?? '—'}</span>
          {item.isVip && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">VIP</span>}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', SEGMENT_COLORS[item.segment] ?? 'bg-gray-100')}>{item.segment}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
          <span>{item.user?.phone}</span>
          <span>·</span>
          <span>LTV {fmt(item.ltv)}</span>
          <span>·</span>
          <span>Top: {item.topProduct || item.topCategory || '—'}</span>
          {daysOverdue !== null && daysOverdue >= 0 && (
            <><span>·</span><span className="text-red-500 font-medium">{daysOverdue}d overdue</span></>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.user?.phone && (
          <a
            href={`tel:${item.user.phone}`}
            className="h-8 w-8 rounded-full bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {item.user?.phone && (
          <a
            href={`https://wa.me/91${item.user.phone}`}
            target="_blank"
            rel="noreferrer"
            className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          onClick={() => onLogCall(item.userId)}
          className="text-[11px] px-2.5 py-1.5 rounded-md bg-[#D4A017]/10 text-[#7C5C1E] hover:bg-[#D4A017]/20 font-medium transition-colors"
        >
          Log Call
        </button>
      </div>
    </div>
  );
}

function LogCallModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [outcome, setOutcome] = useState('connected');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId, outcome, notes, callbackAt: callbackAt || undefined }),
    onSuccess: () => {
      toast({ title: 'Call logged' });
      qc.invalidateQueries({ queryKey: ['crm-queue'] });
      onClose();
    },
    onError: () => toast({ title: 'Failed to log call', variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Log Call Outcome</h3>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOME_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={cn(
                'text-[12px] py-2 px-3 rounded-md border font-medium transition-colors',
                outcome === o.value ? 'bg-[#1A3625] text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
        />
        {outcome === 'callback' && (
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={e => setCallbackAt(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
          />
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="text-sm px-4 py-2 rounded-md bg-[#1A3625] text-white hover:bg-[#1A3625]/90 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const [tab, setTab] = useState<string>('today');
  const [logCallId, setLogCallId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-queue', tab],
    queryFn: () => api.getCrmQueue(tab),
  });

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Retarget Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">{data.length} customers</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-4 pb-0 border-b bg-white overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-t-md border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === t.key ? 'border-[#D4A017] text-[#7C5C1E]' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <t.icon className={cn('h-3.5 w-3.5', tab === t.key ? t.color : 'text-gray-400')} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data.length ? (
          <div className="text-center py-16 text-gray-400 text-sm">No customers in this tab</div>
        ) : (
          data.map((item: any) => (
            <CustomerRow key={item._id} item={item} onLogCall={setLogCallId} />
          ))
        )}
      </div>

      {logCallId && <LogCallModal customerId={logCallId} onClose={() => setLogCallId(null)} />}
    </div>
  );
}
