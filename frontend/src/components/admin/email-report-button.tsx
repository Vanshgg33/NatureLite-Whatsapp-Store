'use client';

import { useState } from 'react';
import { Mail, Send, FileText, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

type Props = {
  generatePdfBase64: () => Promise<string>;
  filename: string;
  subject?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
  className?: string;
  disabled?: boolean;
};

type Stage = 'idle' | 'generating' | 'sending' | 'done';

export function EmailReportButton({ generatePdfBase64, filename, subject, variant = 'outline', size = 'sm', className, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');

  async function handleSend() {
    if (!email.trim() || stage !== 'idle') return;
    setStage('generating');
    try {
      const pdfBase64 = await generatePdfBase64();
      setStage('sending');
      await api.sendReportEmail(email.trim(), subject || filename, filename, pdfBase64);
      setStage('done');
      setTimeout(() => {
        setOpen(false);
        setEmail('');
        setStage('idle');
      }, 1800);
    } catch {
      setStage('idle');
      toast({ title: 'Failed to send email', variant: 'destructive' });
    }
  }

  const busy = stage === 'generating' || stage === 'sending';

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`gap-2 ${className ?? ''}`}
        onClick={() => { setOpen(true); setStage('idle'); }}
        disabled={disabled}
      >
        <Mail className="h-4 w-4" />
        Email
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) { setEmail(''); setStage('idle'); } } }}>
        <DialogContent className="p-0 max-w-md overflow-hidden border-0 shadow-2xl rounded-2xl">

          {/* Header */}
          <div
            className="relative px-8 pt-8 pb-6 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F2318 0%, #1E3D2B 50%, #2A5A40 100%)' }}
          >
            {/* Decorative circles */}
            <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full opacity-10" style={{ background: '#D4A017' }} />
            <div className="absolute top-4 -right-2 h-14 w-14 rounded-full opacity-10" style={{ background: '#D4A017' }} />
            <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full opacity-5" style={{ background: '#fff' }} />

            <button
              onClick={() => { if (!busy) { setOpen(false); setEmail(''); setStage('idle'); } }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon */}
            <div className="relative mb-4 h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.3)' }}>
              <Mail className="h-6 w-6" style={{ color: '#D4A017' }} />
            </div>

            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">Nature Lite Admin</p>
            <h2 className="text-white text-xl font-bold leading-tight">Send Report</h2>
            <p className="text-white/60 text-sm mt-1">Deliver this report directly to any inbox</p>

            {/* File chip */}
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <FileText className="h-3.5 w-3.5 text-white/50 shrink-0" />
              <span className="text-white/70 text-xs font-medium truncate max-w-[260px]">{filename}</span>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6 bg-white">
            {stage === 'done' ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                </div>
                <p className="text-gray-800 font-semibold text-base">Email sent!</p>
                <p className="text-gray-400 text-sm text-center">Report delivered to <span className="text-gray-600 font-medium">{email}</span></p>
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Recipient email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="email"
                    placeholder="someone@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    disabled={busy}
                    autoFocus
                    className="pl-10 h-11 text-sm border-gray-200 focus:border-[#1E3D2B] focus:ring-[#1E3D2B]/10 rounded-xl"
                  />
                </div>

                <div className="mt-2 px-1">
                  <p className="text-xs text-gray-400">The PDF report will be attached to the email automatically.</p>
                </div>

                <button
                  onClick={handleSend}
                  disabled={!email.trim() || busy}
                  className="mt-5 w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: busy || !email.trim() ? '#e5e7eb' : 'linear-gradient(135deg, #1E3D2B, #2F6B47)', color: busy || !email.trim() ? '#9ca3af' : 'white' }}
                >
                  {stage === 'generating' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</>
                  ) : stage === 'sending' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending email…</>
                  ) : (
                    <><Send className="h-4 w-4" /> Send Report</>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-5 bg-white">
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] text-gray-300 text-center">Sent from Nature Lite Admin Panel &nbsp;·&nbsp; Reports are confidential</p>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}
