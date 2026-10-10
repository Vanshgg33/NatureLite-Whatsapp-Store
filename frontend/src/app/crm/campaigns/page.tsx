'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, CheckCircle, X, Megaphone, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { segmentLabel } from '@/lib/crm/format';

// ─── Config ───────────────────────────────────────────────────────────────────

const ALL_SEGMENTS = ['new', 'active', 'due_soon', 'due_today', 'overdue', 'at_risk', 'dormant'] as const;

const SEG_COLORS: Record<string, string> = {
  new:       'var(--crm-blue)',
  active:    'var(--crm-success)',
  due_soon:  'var(--crm-amber)',
  due_today: 'var(--crm-amber)',
  overdue:   'var(--crm-danger)',
  at_risk:   '#F97316',
  dormant:   'var(--crm-muted)',
};

const SEG_BG: Record<string, string> = {
  new:       'var(--crm-blue-bg)',
  active:    'var(--crm-success-bg)',
  due_soon:  'var(--crm-amber-bg)',
  due_today: 'var(--crm-amber-bg)',
  overdue:   'var(--crm-danger-bg)',
  at_risk:   '#FFF3E8',
  dormant:   'var(--crm-sand-2)',
};

const TEMPLATES = [
  {
    key: 'repurchase',
    label: 'Repurchase nudge',
    segments: ['due_soon', 'due_today'],
    body: `Hi! 👋\n\nYour usual products are likely running low. You usually reorder every month — want to place your order?\n\nReply here or visit our store. 🌿\n\n— NatureLite`,
  },
  {
    key: 'winback',
    label: 'Win-Back',
    segments: ['dormant', 'at_risk'],
    body: `Hi there! 😊\n\nWe noticed it's been a while since your last order. We miss you!\n\nWe'd love to have you back. Anything we can help with?\n\n— NatureLite 🌿`,
  },
  {
    key: 'overdue_urgency',
    label: 'Overdue urgency',
    segments: ['overdue'],
    body: `Hi! ⚠️\n\nIt looks like your reorder is overdue — we don't want you to run out!\n\nReply here to place your order and we'll get it out to you right away.\n\n— NatureLite 🌿`,
  },
  {
    key: 'vip_checkin',
    label: 'VIP check-in',
    segments: ['active'],
    body: `Hi! 🌟\n\nAs one of our valued customers, we wanted to personally check in. Is there anything you need from our range?\n\nWe're always here for you. 🌿\n\n— NatureLite`,
  },
  {
    key: 'new_welcome',
    label: 'New customer welcome',
    segments: ['new'],
    body: `Welcome to NatureLite! 🌿\n\nWe're so glad to have you. If you have any questions about our products or need help with your order, just reply here.\n\nLooking forward to serving you!\n\n— The NatureLite Team`,
  },
  {
    key: 'custom',
    label: 'Custom',
    segments: [],
    body: '',
  },
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:    { bg: 'var(--crm-sand-2)',    color: 'var(--crm-muted)',   label: 'Draft' },
  approved: { bg: 'var(--crm-blue-bg)',   color: 'var(--crm-blue)',    label: 'Approved' },
  sent:     { bg: 'var(--crm-success-bg)', color: 'var(--crm-success)', label: 'Sent' },
};

function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
}

// ─── Create drawer ────────────────────────────────────────────────────────────

type FormState = { name: string; segmentFilter: string[]; waMessage: string };
const EMPTY_FORM: FormState = { name: '', segmentFilter: [], waMessage: '' };

function CreateDrawer({ onClose, onCreate, creating }: { onClose: () => void; onCreate: (f: FormState) => void; creating?: boolean }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeTemplate, setActiveTemplate] = useState('');

  const toggleSeg = (s: string) => setForm(f => ({
    ...f,
    segmentFilter: f.segmentFilter.includes(s)
      ? f.segmentFilter.filter(x => x !== s)
      : [...f.segmentFilter, s],
  }));

  const pickTemplate = (key: string) => {
    const t = TEMPLATES.find(t => t.key === key);
    if (!t) return;
    setActiveTemplate(key);
    setForm(f => ({
      ...f,
      waMessage: t.body,
      segmentFilter: t.segments.length
        ? Array.from(new Set([...f.segmentFilter, ...t.segments]))
        : f.segmentFilter,
    }));
  };

  const canCreate = form.name.trim() && form.waMessage.trim() && form.segmentFilter.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--crm-line)' }}>
          <h3 className="font-semibold text-[16px]" style={{ color: 'var(--crm-ink)' }}>New Campaign</h3>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--crm-muted)', background: 'var(--crm-sand)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--crm-muted)' }}>
                Campaign Name
              </label>
              <input
                placeholder="e.g. October Win-Back"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl text-[13px] focus:outline-none transition-colors"
                style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--crm-gold)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--crm-line)')}
              />
            </div>

            {/* Segments */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: 'var(--crm-muted)' }}>
                Target Segments
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_SEGMENTS.map(s => {
                  const active = form.segmentFilter.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSeg(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                      style={active
                        ? { background: SEG_BG[s], color: SEG_COLORS[s], border: `1.5px solid color-mix(in srgb, ${SEG_COLORS[s]} 30%, transparent)` }
                        : { background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? SEG_COLORS[s] : 'var(--crm-line)' }} />
                      {segmentLabel(s)}
                    </button>
                  );
                })}
              </div>
              {form.segmentFilter.length > 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--crm-muted)' }}>
                  Targeting {form.segmentFilter.length} segment{form.segmentFilter.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Templates */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3 w-3" style={{ color: 'var(--crm-gold)' }} />
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--crm-muted)' }}>
                  Templates
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {TEMPLATES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => pickTemplate(t.key)}
                    className="px-3 py-2 rounded-xl text-[12px] font-medium text-left transition-all"
                    style={activeTemplate === t.key
                      ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)', border: '1.5px solid var(--crm-forest-2)' }
                      : { background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--crm-muted)' }}>
                WhatsApp Message
              </label>
              <textarea
                placeholder="Write your WhatsApp message… or pick a template above"
                value={form.waMessage}
                onChange={e => { setForm(f => ({ ...f, waMessage: e.target.value })); setActiveTemplate('custom'); }}
                rows={6}
                className="w-full px-3.5 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none leading-relaxed"
                style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--crm-gold)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--crm-line)')}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--crm-muted)' }}>
                {form.waMessage.length} chars
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--crm-line)' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => canCreate && !creating && onCreate(form)}
            disabled={!canCreate || creating}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
          >
            {creating ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['crm-campaigns'],
    queryFn: () => api.getCrmCampaigns(),
  });

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (form: FormState) => api.createCrmCampaign(form),
    onSuccess: () => {
      toast({ title: 'Campaign created' });
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] });
      setShowCreate(false);
    },
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

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div
        className="px-7 py-5 flex items-center justify-between"
        style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}
      >
        <div>
          <h1
            className="text-[20px] font-semibold flex items-center gap-2.5"
            style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
          >
            <Megaphone className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
            Campaigns
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
            {isLoading ? 'Loading…' : `${(campaigns as any[]).length} campaigns`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {/* List */}
      <div className="p-7 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-7 w-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
          </div>
        ) : !(campaigns as any[]).length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--crm-sand-2)' }}>
              <Megaphone className="h-6 w-6" style={{ color: 'var(--crm-muted)' }} />
            </div>
            <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>No campaigns yet</p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--crm-muted)' }}>Create your first WhatsApp campaign</p>
          </div>
        ) : (campaigns as any[]).map((c: any) => {
          const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
          return (
            <div key={c._id} className="crm-card-v2 p-5 crm-count-in">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title + status */}
                  <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                    <h3 className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>{c.name}</h3>
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                    {c.sentAt && (
                      <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>Sent {fmtDate(c.sentAt)}</span>
                    )}
                  </div>

                  {/* Segment chips */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {(c.segmentFilter ?? []).map((s: string) => {
                      const key = s.toLowerCase().replace(/\s/g, '_');
                      const color = SEG_COLORS[key] ?? 'var(--crm-muted)';
                      const bg = SEG_BG[key] ?? 'var(--crm-sand-2)';
                      return (
                        <span
                          key={s}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: bg, color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                          {segmentLabel(s)}
                        </span>
                      );
                    })}
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)' }}
                    >
                      {c.recipientCount ?? 0} recipients
                    </span>
                  </div>

                  {/* Message preview */}
                  <p
                    className="text-[12px] leading-relaxed line-clamp-2 px-3 py-2 rounded-xl whitespace-pre-line"
                    style={{ background: 'var(--crm-sand)', color: 'var(--crm-ink-2)' }}
                  >
                    {c.waMessage}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {c.status === 'draft' && (
                    <button
                      onClick={() => approve(c._id)}
                      className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-80"
                      style={{ background: 'var(--crm-blue-bg)', color: 'var(--crm-blue)', border: '1px solid color-mix(in srgb, var(--crm-blue) 30%, transparent)' }}
                    >
                      Approve
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button
                      onClick={() => send(c._id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-80"
                      style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
                    >
                      <Send className="h-3.5 w-3.5" /> Send Now
                    </button>
                  )}
                  {c.status === 'sent' && (
                    <div
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold"
                      style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Sent
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateDrawer
          onClose={() => setShowCreate(false)}
          onCreate={form => create(form)}
          creating={creating}
        />
      )}
    </div>
  );
}
