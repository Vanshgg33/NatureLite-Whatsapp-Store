'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { amountInWords } from '@/lib/billing/utils/amountInWords';

const SELLER_NAME = 'NATURE LITE FOODS';
const SELLER_ADDR = 'AVANTI VIHAR RD, KAVITA NAGAR,\nGEETANJALI COLONY, SHANKAR NAGAR,\nRAIPUR, C.G. 492001';
const SELLER_PHONE = '8817200740';
const SELLER_GSTIN = '22ABJCS3598L1ZR';

function inr(r: number) {
  return '₹' + (r ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function p2r(p: number) { return (p ?? 0) / 100; }
function inrP(p: number) { return inr(p2r(p)); }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Line() {
  return <div style={{ borderTop: '1px dashed #999', margin: '4px 0' }} />;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

export default function ThermalReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';

  const { data: bill, isLoading, isError } = useQuery({
    queryKey: ['billing-bill', id],
    queryFn: () => api.getBillingBill(id),
  });

  useEffect(() => {
    if (bill && autoPrint) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [bill, autoPrint]);

  if (isLoading) return <div style={{ padding: 16, fontFamily: 'monospace' }}>Loading…</div>;
  if (isError || !bill) return <div style={{ padding: 16, fontFamily: 'monospace', color: 'red' }}>Not found.</div>;

  const isInterState = bill.isInterState ?? false;
  const hasPaise = (bill.grandTotalPaise ?? 0) > 0;

  const subtotalP = hasPaise ? (bill.taxablePaise ?? Math.round((bill.subtotal ?? 0) * 100)) : Math.round((bill.subtotal ?? 0) * 100);
  const billDiscP = bill.billDiscountAmtPaise ?? 0;
  const chargesP  = (bill.charges ?? []).reduce((s: number, c: any) => s + Math.round((c.amtRupees ?? 0) * 100), 0);
  const cgstP     = hasPaise ? (bill.cgstTotalPaise ?? 0) : 0;
  const sgstP     = hasPaise ? (bill.sgstTotalPaise ?? 0) : 0;
  const igstP     = hasPaise ? (bill.igstTotalPaise ?? 0) : 0;
  const totalGstP = hasPaise ? cgstP + sgstP + igstP : Math.round((bill.totalGst ?? 0) * 100);
  const roundOffP = bill.roundOffPaise ?? 0;
  const grandP    = hasPaise ? (bill.grandTotalPaise ?? 0) : Math.round((bill.grandTotal ?? 0) * 100);
  const paidP     = hasPaise ? (bill.amountPaidPaise ?? 0) : Math.round((bill.amountPaid ?? 0) * 100);
  const dueP      = hasPaise ? (bill.amountDuePaise ?? 0) : Math.round((bill.amountDue ?? 0) * 100);

  const invoiceDate = bill.invoiceDate ?? bill.createdAt;

  const style: React.CSSProperties = {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: 11,
    width: 58 * 3.7795, // 58mm in px
    maxWidth: 220,
    margin: '0 auto',
    padding: '8px 6px',
    color: '#000',
    background: '#fff',
  };

  return (
    <>
      <div style={style}>
        {/* Print button — hidden on print */}
        <div className="print:hidden" style={{ marginBottom: 8, textAlign: 'center' }}>
          <button onClick={() => window.print()}
            style={{ fontSize: 11, padding: '4px 12px', cursor: 'pointer', background: '#1a6b3c', color: '#fff', border: 'none', borderRadius: 4 }}>
            Print Receipt
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{SELLER_NAME}</div>
        <div style={{ textAlign: 'center', fontSize: 9.5, whiteSpace: 'pre-line' }}>{SELLER_ADDR}</div>
        <div style={{ textAlign: 'center', fontSize: 9.5 }}>Ph: {SELLER_PHONE}</div>
        <div style={{ textAlign: 'center', fontSize: 9, marginTop: 1 }}>GSTIN: {SELLER_GSTIN}</div>

        <Line />

        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 12 }}>GST INVOICE</div>

        <Line />

        {/* Invoice meta */}
        <Row label="Invoice No" value={bill.invoiceNo ?? '—'} />
        <Row label="Date" value={fmtDate(invoiceDate)} />
        <Row label="Customer" value={bill.customerName} />
        {bill.customerPhone && <Row label="Phone" value={bill.customerPhone} />}
        {bill.customerGstNo && <Row label="GSTIN" value={bill.customerGstNo} />}
        {bill.paymentMode && (
          <Row label="Payment" value={(bill.paymentMode as string).toUpperCase()} />
        )}

        <Line />

        {/* Items */}
        {(bill.items ?? []).map((it: any, i: number) => {
          const qty   = it.qty ?? 0;
          const rate  = it.rate ?? it.unitPrice ?? 0;
          const total = it.total != null ? (hasPaise ? p2r(it.total) : it.total) : 0;
          return (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ fontWeight: 600 }}>{i + 1}. {it.name}</div>
              {it.hsnCode && <div style={{ fontSize: 9, color: '#444' }}>HSN: {it.hsnCode} · GST: {it.gstRate ?? 0}%</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{qty} {it.unit ?? ''} × {inr(rate)}</span>
                <span style={{ fontWeight: 600 }}>{inr(total)}</span>
              </div>
            </div>
          );
        })}

        <Line />

        {/* Totals */}
        <Row label="Subtotal" value={inr(p2r(subtotalP))} />
        {billDiscP > 0 && <Row label={`Disc (${bill.billDiscountPct ?? 0}%)`} value={`-${inrP(billDiscP)}`} />}
        {chargesP > 0 && <Row label="Charges" value={inrP(chargesP)} />}
        {isInterState ? (
          totalGstP > 0 && <Row label={`IGST`} value={inr(p2r(totalGstP))} />
        ) : (
          <>
            {cgstP > 0 && <Row label="CGST" value={inrP(cgstP)} />}
            {sgstP > 0 && <Row label="SGST" value={inrP(sgstP)} />}
          </>
        )}
        {roundOffP !== 0 && <Row label="Round Off" value={(roundOffP > 0 ? '+' : '') + inrP(roundOffP)} />}

        <Line />
        <Row label="TOTAL" value={inrP(grandP)} bold />
        {paidP > 0 && <Row label="Paid" value={inrP(paidP)} />}
        {dueP > 0 && <Row label="BALANCE DUE" value={inrP(dueP)} bold />}
        <Line />

        {/* Amount in words */}
        <div style={{ fontSize: 9, fontStyle: 'italic', marginBottom: 4 }}>
          {amountInWords(grandP)}
        </div>

        <Line />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 9, marginTop: 4 }}>
          <div>Thank you for your purchase!</div>
          <div style={{ marginTop: 2 }}>Tax not payable on reverse charge</div>
          <div>E.&amp;O.E.</div>
        </div>

        {/* Trailing feed */}
        <div style={{ height: 20 }} />
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: 58mm auto; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}
