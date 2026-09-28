'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, CheckCircle, X, Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

const ALL_SEGMENTS = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant'];
const SEG_COLORS: Record<string, string> = {
  'New': '#3B82F6', 'Active': '#22C55E', 'Due Soon': '#F59E0B',
  'Overdue': '#EF4444', 'At Risk': '#F97316', 'Dormant': '#9CA3AF',
};

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  draft:    { bg: '#F7F5F0', color: '#6B6560', label: 'Draft' },
  approved: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Approved' },
  sent:     { bg: '#F0FDF4', color: '#15803D', label: 'Sent' },
};

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'; }

export default function CampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', segmentFilter: [] as string[], waMessage: '' });

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ['crm-campaigns'], queryFn: () => api.getCrmCampaigns() });

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () => api.createCrmCampaign(form),
    onSuccess: () => { toast({ title: 'Campaign created' }); qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); setShowCreate(false); setForm({ name: '', segmentFilter: [], waMessage: '' }); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: approve } = useMutation({
    mutationFn: (id: string) => api.approveCrmCampaign(id),
    onSuccess: () => { toast({ title: 'Approved' }); qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); },
    onError: () => toast({ title: 'Approve failed', variant: 'destructive' }),
  });
  const { mutate: send } = useMutation({
    mutationFn: (id: string) => api.sendCrmCampaign(id),
    onSuccess: () => { toast({ title: 'Campaign sent!' }); qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); },
    onError: () => toast({ title: 'Send failed', variant: 'destructive' }),
  });

  const toggleSeg = (s: string) => setForm(f => ({
    ...f, segmentFilter: f.segmentFilter.includes(s) ? f.segmentFilter.filter(x => x !== s) : [...f.segmentFilter, s],
  }));

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      <div className="bg-white px-7 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2.5" style={{ color: '#1C1917' }}>
            <Megaphone className="h-5 w-5" style={{ color: '#D4A017' }} />
            Campaigns
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>{campaigns.length} campaigns</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
          style={{ background: '#1A3625', color: '#D4A017' }}
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      <div className="p-7 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !campaigns.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#F0EDE7' }}>
              <Megaphone className="h-6 w-6" style={{ color: '#A09A93' }} />
            </div>
            <p className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>No campaigns yet</p>
            <p className="text-[13px] mt-1" style={{ color: '#A09A93' }}>Create your first WhatsApp campaign</p>
          </div>
        ) : campaigns.map((c: any) => {
          const st = STATUS[c.status] ?? STATUS.draft;
          return (
            <div key={c._id} className="bg-white rounded-xl p-5 crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                    <h3 className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>{c.name}</h3>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    {c.sentAt && <span className="text-[11px]" style={{ color: '#A09A93' }}>Sent {fmtDate(c.sentAt)}</span>}
                  </div>

                  {/* Segments */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {(c.segmentFilter ?? []).map((s: string) => (
                      <span key={s} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${SEG_COLORS[s]}18`, color: SEG_COLORS[s] }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEG_COLORS[s] }} /> {s}
                      </span>
                    ))}
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#F7F5F0', color: '#6B6560' }}>
                      {c.recipientCount ?? 0} recipients
                    </span>
                  </div>

                  {/* Message preview */}
                  <p className="text-[12px] leading-relaxed line-clamp-2 px-3 py-2 rounded-xl" style={{ background: '#F7F5F0', color: '#6B6560' }}>{c.waMessage}</p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {c.status === 'draft' && (
                    <button onClick={() => approve(c._id)}
                      className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors"
                      style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                    >
                      Approve
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button onClick={() => send(c._id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors"
                      style={{ background: '#1A3625', color: '#D4A017' }}
                    >
                      <Send className="h-3.5 w-3.5" /> Send Now
                    </button>
                  )}
                  {c.status === 'sent' && (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold" style={{ background: '#F0FDF4', color: '#15803D' }}>
                      <CheckCircle className="h-3.5 w-3.5" /> Sent
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" style={{ border: '1px solid #E8E2D9' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0EDE7' }}>
              <h3 className="font-semibold text-[16px]" style={{ color: '#1C1917' }}>New Campaign</h3>
              <button onClick={() => setShowCreate(false)} className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ color: '#A09A93', background: '#F7F5F0' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: '#A09A93' }}>Campaign Name</label>
                <input
                  placeholder="e.g. August Win-Back"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] focus:outline-none"
                  style={{ border: '1px solid #E8E2D9', color: '#1C1917', background: '#FAFAF8' }}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: '#A09A93' }}>Target Segments</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SEGMENTS.map(s => (
                    <button key={s} onClick={() => toggleSeg(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                      style={form.segmentFilter.includes(s)
                        ? { background: `${SEG_COLORS[s]}18`, color: SEG_COLORS[s], border: `1.5px solid ${SEG_COLORS[s]}40` }
                        : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: form.segmentFilter.includes(s) ? SEG_COLORS[s] : '#D1D5DB' }} />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: '#A09A93' }}>WhatsApp Message</label>
                <textarea
                  placeholder="Write your WhatsApp message…"
                  value={form.waMessage} onChange={e => setForm(f => ({ ...f, waMessage: e.target.value }))}
                  rows={5}
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none leading-relaxed"
                  style={{ border: '1px solid #E8E2D9', color: '#1C1917', background: '#FAFAF8' }}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-medium"
                  style={{ border: '1px solid #E8E2D9', color: '#6B6560' }}
                >
                  Cancel
                </button>
                <button onClick={() => create()} disabled={creating || !form.name || !form.waMessage}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
                  style={{ background: '#1A3625', color: '#D4A017' }}
                >
                  {creating ? 'Creating…' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
