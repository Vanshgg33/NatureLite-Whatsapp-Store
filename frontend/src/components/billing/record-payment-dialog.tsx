'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { invalidateBilling } from '@/lib/billing/invalidate';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CashCounter, type CashTender } from './CashCounter';
import { useCashDrawer, cashDrawerKey } from '@/lib/billing/cash/useCashDrawer';
import { activeDrawer, apiErrorCode } from '@/lib/billing/cash/drawer';
import type { Counts } from '@/lib/billing/cash/cashChange';

const MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank', 'Bank transfer']] as const;
type Mode = (typeof MODES)[number][0];

const inr = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Records a later payment against one bill (Dues page and invoice page). Mount it only while it should be open. */
export function RecordPaymentDialog({ bill, onClose }: { bill: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const dueP = bill.amountDuePaise > 0 ? bill.amountDuePaise : Math.round((bill.amountDue ?? 0) * 100);
  const [amount, setAmount] = useState((dueP / 100).toFixed(2));
  const [mode, setMode] = useState<Mode>('cash');
  const [err, setErr] = useState('');

  // cash into a store whose drawer is on goes through the counter: the amount is what the notes cover
  const storeId = bill.storeId ? String(bill.storeId) : undefined;
  const drawerQ = useCashDrawer(storeId, bill.docType !== 'SALE_ORDER');
  const drawer = bill.docType === 'SALE_ORDER' ? null : activeDrawer(drawerQ.drawer);
  const [received, setReceived] = useState<Counts>({});
  const [tender, setTender] = useState<CashTender | null>(null);
  const [skip, setSkip] = useState('');
  const counting = mode === 'cash' && !!drawer && !skip;
  const sendRupees = counting ? tender?.appliedRupees ?? 0 : Math.round(Number(amount) * 100) / 100;

  const pay = useMutation({
    mutationFn: () => api.recordBillingPayment(bill._id, sendRupees, mode,
      mode === 'cash' && drawer ? (skip ? { skip: { reason: skip } } : { received: tender!.received, returned: tender!.returned }) : undefined),
    onSuccess: (updated) => {
      invalidateBilling(qc);
      if (storeId) qc.invalidateQueries({ queryKey: cashDrawerKey(storeId) });
      const change = counting ? tender?.changeRupees ?? 0 : 0;
      toast({ title: `${inr(Math.round(sendRupees * 100))} received by ${MODES.find(m => m[0] === mode)![1]}${change ? ` · give ₹${change.toLocaleString('en-IN')} change` : ''}`, description: updated?.paymentStatus === 'paid' ? `${bill.invoiceNo} is now fully paid` : `${bill.invoiceNo} still has ${inr(updated?.amountDuePaise ?? 0)} due` });
      onClose();
    },
    // keep the dialog and the typed amount: the cashier can fix and retry
    onError: (e) => {
      const { code, details } = apiErrorCode(e);
      if (code === 'DRAWER_STOCK_INSUFFICIENT' && details?.counts) drawerQ.setCounts(details.counts);
      setErr(getApiError(e)); invalidateBilling(qc);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pay.isPending) return;
    if (counting) {
      if (drawerQ.isLoading || !tender) { setErr('Loading the cash drawer…'); return; }
      if (!tender.valid) { setErr(tender.status === 'CANNOT_CHANGE' ? 'The change cannot be made from the drawer' : 'The change does not add up'); return; }
      if (tender.appliedRupees <= 0) { setErr('Type the notes received'); return; }
    } else {
      const p = Math.round(Number(amount) * 100);
      if (!Number.isFinite(p) || p <= 0 || p > dueP) { setErr(`Enter between ₹0.01 and ${inr(dueP)}`); return; }
    }
    setErr('');
    pay.mutate();
  };

  const askSkip = () => {
    const r = window.prompt('Why is the cash not being counted? (recorded on the drawer)')?.trim();
    if (r) setSkip(r.slice(0, 300));
  };

  return (
    <Dialog open onOpenChange={o => { if (!o && !pay.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm rounded-xl p-5 gap-0 print:hidden max-h-[92vh] overflow-y-auto"
        onEscapeKeyDown={e => { if (pay.isPending) e.preventDefault(); }}
        onPointerDownOutside={e => { if (pay.isPending) e.preventDefault(); }}>
        <DialogTitle className="font-semibold text-gray-800 text-base">Record Payment</DialogTitle>
        <DialogDescription className="text-sm text-gray-500 mt-1 mb-3">
          {bill.customerName} · <span className="font-mono text-xs">{bill.invoiceNo}</span>
        </DialogDescription>
        <form onSubmit={submit} noValidate>
          <div className="bg-red-50 rounded-lg p-3 mb-3 flex justify-between items-center">
            <span className="text-sm text-red-700 font-medium">Amount Due</span>
            <span className="text-xl font-bold text-red-600 tabular-nums">{inr(dueP)}</span>
          </div>
          <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-4 gap-1.5 mb-3">
            {MODES.map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={pay.isPending}
                onClick={() => { setMode(m); setErr(''); }}
                className={cn('py-1.5 rounded-md border text-xs font-medium transition-colors',
                  mode === m ? 'bg-[#2d7a4f] text-white border-[#2d7a4f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                {label}
              </button>
            ))}
          </div>
          {counting ? (
            <>
              <CashCounter amountRupees={Math.floor(dueP / 100)} drawer={drawer!} received={received} onReceivedChange={setReceived}
                onTender={setTender} disabled={pay.isPending} onSkip={drawer!.mode === 'SOFT' ? askSkip : undefined} />
              <p className="text-xs text-gray-600 mt-2">Payment recorded: <b className="tabular-nums">₹{(tender?.appliedRupees ?? 0).toLocaleString('en-IN')}</b>{dueP % 100 ? ' (paise stay due)' : ''}</p>
            </>
          ) : (
            <>
              <label htmlFor="pay-amount" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input id="pay-amount" type="number" inputMode="decimal" value={amount} min={0.01} max={dueP / 100} step={0.01} autoFocus
                  onChange={e => { setAmount(e.target.value); setErr(''); }} disabled={pay.isPending}
                  aria-invalid={!!err} aria-describedby={err ? 'pay-err' : undefined}
                  className="w-full pl-7 border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]" />
              </div>
              {mode === 'cash' && skip && (
                <p className="text-[11px] text-amber-800 mt-2">Cash not counted: &ldquo;{skip}&rdquo;. <button type="button" className="underline" onClick={() => setSkip('')}>Count instead</button></p>
              )}
            </>
          )}
          {err && <p id="pay-err" role="alert" className="text-red-600 text-xs mt-2">{err}</p>}
          <div className="flex gap-2 mt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#2d7a4f] hover:bg-[#245f3d] text-white" disabled={pay.isPending || (counting && !tender?.valid)}>
              {pay.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : 'Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
