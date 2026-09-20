// frontend/src/app/crm/campaigns/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const ALL_SEGMENTS = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant'];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-50 text-blue-700',
  sent: 'bg-green-50 text-green-700',
};

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

export default function CampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', segmentFilter: [] as string[], waMessage: '' });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['crm-campaigns'],
    queryFn: () => api.getCrmCampaigns(),
  });

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => api.createCrmCampaign(form),
    onSuccess: () => {
      toast({ title: 'Campaign created' });
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] });
      setShowCreate(false);
      setForm({ name: '', segmentFilter: [], waMessage: '' });
    },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });

  const { mutate: approve } = useMutation({
    mutationFn: (id: string) => api.approveCrmCampaign(id),
    onSuccess: () => { toast({ title: 'Approved' }); qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); },
  });

  const { mutate: send } = useMutation({
    mutationFn: (id: string) => api.sendCrmCampaign(id),
    onSuccess: () => { toast({ title: 'Campaign sent' }); qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); },
    onError: () => toast({ title: 'Send failed', variant: 'destructive' }),
  });

  const toggleSeg = (s: string) => setForm(f => ({
    ...f,
    segmentFilter: f.segmentFilter.includes(s) ? f.segmentFilter.filter(x => x !== s) : [...f.segmentFilter, s],
  }));

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Campaigns</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1A3625] text-white text-sm font-medium hover:bg-[#1A3625]/90">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      <div className="p-5 space-y-3">
        {isLoading ? <div className="flex justify-center py-16"><div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" /></div> :
          campaigns.map((c: any) => (
            <div key={c._id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm text-gray-900">{c.name}</h3>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_STYLES[c.status] ?? 'bg-gray-100')}>{c.status}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Segments: {c.segmentFilter.join(', ') || '—'} · {c.recipientCount} recipients</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{c.waMessage}</p>
                  {c.sentAt && <p className="text-[10px] text-gray-400 mt-1">Sent {fmtDate(c.sentAt)}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {c.status === 'draft' && (
                    <button onClick={() => approve(c._id)} className="text-[11px] px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">Approve</button>
                  )}
                  {c.status === 'approved' && (
                    <button onClick={() => send(c._id)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-md bg-[#1A3625] text-white hover:bg-[#1A3625]/90 font-medium">
                      <Send className="h-3 w-3" /> Send
                    </button>
                  )}
                  {c.status === 'sent' && <CheckCircle className="h-5 w-5 text-green-500" />}
                </div>
              </div>
            </div>
          ))
        }
        {!isLoading && !campaigns.length && <p className="text-center text-sm text-gray-400 py-16">No campaigns yet</p>}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">New Campaign</h3>
            <input
              placeholder="Campaign name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
            <div>
              <p className="text-[11px] text-gray-500 mb-2 font-medium">Target segments</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SEGMENTS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSeg(s)}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors',
                      form.segmentFilter.includes(s) ? 'bg-[#1A3625] text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              placeholder="WhatsApp message…"
              value={form.waMessage}
              onChange={e => setForm(f => ({ ...f, waMessage: e.target.value }))}
              rows={4}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="text-sm px-4 py-2 rounded-md border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={() => create()} disabled={creating || !form.name || !form.waMessage} className="text-sm px-4 py-2 rounded-md bg-[#1A3625] text-white disabled:opacity-40">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
