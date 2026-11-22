'use client';
import { useState } from 'react';
import { CashCounter, type CashTender } from './CashCounter';
import { useCashDrawer } from '@/lib/billing/cash/useCashDrawer';
import { apiErrorCode, type CashBlock } from '@/lib/billing/cash/drawer';

/**
 * Cancel dialogs: a bill paid in counted cash must hand the cash back out of the drawer. The server says so (and how
 * much) with CASH_REFUND_REQUIRED; then this shows the counter in refund mode and the retry sends the notes picked.
 */
export function useCashRefund(storeId?: string) {
  const [refund, setRefund] = useState<number | null>(null);
  const [tender, setTender] = useState<CashTender | null>(null);
  const q = useCashDrawer(storeId, refund !== null);
  const drawer = q.drawer;
  return {
    /** true when the error was the drawer asking for the refund notes (the dialog stays open) */
    handleError(e: unknown) {
      const { code, details } = apiErrorCode(e);
      if ((code === 'CASH_REFUND_REQUIRED' || code === 'REFUND_MISMATCH') && Number.isFinite(details?.refundRupees)) { setRefund(details.refundRupees); return true; }
      if (code === 'DRAWER_STOCK_INSUFFICIENT' && details?.counts) { q.setCounts(details.counts); return true; }
      return false;
    },
    cash: (refund !== null && tender?.valid ? { returned: tender.returned } : undefined) as CashBlock | undefined,
    blocked: refund !== null && !tender?.valid,
    panel: refund === null ? null : drawer ? (
      <div className="mt-3">
        <p className="text-xs text-gray-600 mb-1.5">This bill was paid in counted cash. Pick the notes/coins you hand back.</p>
        <CashCounter mode="refund" amountRupees={refund} drawer={drawer} received={{}} onReceivedChange={() => undefined} onTender={setTender} />
      </div>
    ) : q.isError ? (
      <p className="mt-3 text-xs text-red-600">Could not load the cash drawer. <button type="button" className="underline" onClick={() => q.refresh()}>Retry</button></p>
    ) : <div className="mt-3 h-16 rounded bg-gray-100 animate-pulse" aria-label="Loading cash drawer" />,
  };
}
