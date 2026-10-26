'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Trash2, Plus, Mail, Phone, User, FileText, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

type Recipient = { name: string; email?: string; phone?: string };

export default function ReportsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Recipient>({ name: '', email: '', phone: '' });
  const [sending, setSending] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['report-config'],
    queryFn: () => api.getReportConfig(),
  });

  const recipients: Recipient[] = config?.recipients ?? [];
  const enabled: boolean = config?.enabled ?? true;

  const { mutate: save } = useMutation({
    mutationFn: (data: { recipients?: Recipient[]; enabled?: boolean }) => api.updateReportConfig(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-config'] }); toast({ title: 'Saved' }); },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const addRecipient = () => {
    const name = form.name.trim();
    if (!name) return;
    if (!form.email?.trim() && !form.phone?.trim()) {
      toast({ title: 'Add at least an email or phone', variant: 'destructive' }); return;
    }
    save({ recipients: [...recipients, { name, email: form.email?.trim() || undefined, phone: form.phone?.trim() || undefined }] });
    setForm({ name: '', email: '', phone: '' });
  };

  const removeRecipient = (i: number) => save({ recipients: recipients.filter((_, idx) => idx !== i) });

  const toggleEnabled = () => save({ enabled: !enabled });

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await api.sendReportNow();
      toast({ title: res?.skipped ? 'No recipients configured' : `Report sent to ${res?.recipients} recipient(s)` });
    } catch {
      toast({ title: 'Failed to send report', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Daily Reports" />
      <div className="max-w-3xl mx-auto p-6 space-y-6">

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Daily Business Report</h2>
                <p className="text-sm text-gray-500 mt-0.5">Sent every day at 10 PM IST · PDF + WhatsApp</p>
              </div>
            </div>
            <button
              onClick={toggleEnabled}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={enabled
                ? { background: '#ECFDF5', color: '#065F46' }
                : { background: '#F3F4F6', color: '#6B7280' }}
            >
              {enabled
                ? <><ToggleRight className="h-4 w-4" /> Enabled</>
                : <><ToggleLeft className="h-4 w-4" /> Disabled</>}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
            <button
              onClick={sendNow}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-800 text-amber-300 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Report Now
            </button>
            <p className="text-xs text-gray-400">Generates and sends today's report immediately for testing</p>
          </div>
        </div>

        {/* Recipients */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Recipients</h3>
            <p className="text-sm text-gray-500 mt-0.5">Each person will receive the report via email and/or WhatsApp</p>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : recipients.length === 0 ? (
            <div className="p-10 text-center">
              <User className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No recipients yet. Add someone below.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-9 w-9 rounded-xl bg-emerald-800 flex items-center justify-center text-amber-300 font-bold text-sm flex-shrink-0">
                    {r.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {r.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail className="h-3 w-3" /> {r.email}
                        </span>
                      )}
                      {r.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone className="h-3 w-3" /> +{r.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeRecipient(i)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Add Recipient</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <input
                type="text"
                placeholder="Name *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500 bg-white"
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500 bg-white"
              />
              <input
                type="tel"
                placeholder="WhatsApp (e.g. 919876543210)"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-emerald-500 bg-white"
              />
            </div>
            <button
              onClick={addRecipient}
              disabled={!form.name.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-800 text-amber-300 hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Recipient
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">What's in the report?</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Orders received today vs yesterday (% change)</li>
            <li>Revenue generated today vs yesterday</li>
            <li>Orders delivered and pending dispatch</li>
            <li>New vs repeat customers</li>
            <li>Top 5 products by revenue</li>
          </ul>
          <p className="text-xs text-amber-600 mt-2">
            Email: beautiful PDF attachment · WhatsApp: text summary + PDF document
          </p>
        </div>

      </div>
    </div>
  );
}
