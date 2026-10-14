'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, ArrowLeft, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { amountInWords } from '@/lib/billing/utils/amountInWords';
import { INVOICE_BANK } from '@/components/InvoiceLayout';

// ─── Seller constants ─────────────────────────────────────────────────────────
const SELLER = {
  name: 'NATURE LITE FOODS',
  legal: '(SUHIKA PVT LTD)',
  addr: 'AVANTI VIHAR RD, KAVITA NAGAR, GEETANJALI COLONY, SHANKAR NAGAR, RAIPUR, CHHATTISGARH-492001',
  phone: '8817200740',
  email: 'naturelitefoods@gmail.com',
  gstin: '22ABJCS3598L1ZR',
  state: 'Chhattisgarh',
  stateCode: '22',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function inr(rupees: number) {
  return '₹' + (rupees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function p2r(paise: number) { return (paise ?? 0) / 100; }
function inrP(paise: number) { return inr(p2r(paise)); }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'text-green-700 bg-green-50 border-green-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  unpaid: 'text-red-700 bg-red-50 border-red-200',
};

// ─── GST summary builder ──────────────────────────────────────────────────────
function buildGstSummary(items: any[], isInterState: boolean) {
  const map: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
  for (const it of items) {
    const r = it.gstRate ?? 0;
    if (!map[r]) map[r] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    // prefer paise fields, fall back to old floats * 100
    map[r].taxable += it.taxable ?? Math.round((it.taxableAmount ?? 0) * 100);
    map[r].cgst   += it.cgst   ?? 0;
    map[r].sgst   += it.sgst   ?? 0;
    map[r].igst   += it.igst   ?? 0;
    // if no paise fields, derive from old floats
    if (!it.taxable && !it.cgst && it.gstRate) {
      const tax = Math.round((it.taxableAmount ?? 0) * r / 100 * 100);
      if (isInterState) map[r].igst += tax;
      else { map[r].cgst += Math.floor(tax / 2); map[r].sgst += tax - Math.floor(tax / 2); }
    }
  }
  return Object.entries(map).map(([rate, v]) => ({ rate: Number(rate), ...v })).filter(v => v.rate > 0);
}

// ─── Cancel dialog ────────────────────────────────────────────────────────────
function CancelDialog({ billId, onClose }: { billId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.cancelBillingBill(billId, reason.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-bill', billId] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center print:hidden">
      <div className="bg-white rounded-xl shadow-xl w-[400px] p-6">
        <h3 className="font-semibold text-gray-800 mb-1">Cancel Invoice</h3>
        <p className="text-sm text-gray-500 mb-4">This cannot be undone. Please state the reason.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Reason for cancellation…"
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
        />
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Dismiss</Button>
          <Button size="sm" variant="destructive"
            disabled={!reason.trim() || cancel.isPending}
            onClick={() => cancel.mutate()}>
            {cancel.isPending ? 'Cancelling…' : 'Confirm Cancel'}
          </Button>
        </div>
        {cancel.isError && (
          <p className="text-xs text-red-500 mt-2">{(cancel.error as any)?.message ?? 'Failed'}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoPrint = searchParams.get('print') === '1';
  const [showCancel, setShowCancel] = useState(false);

  const { data: bill, isLoading, isError } = useQuery({
    queryKey: ['billing-bill', id],
    queryFn: () => api.getBillingBill(id),
  });

  useEffect(() => {
    if (bill && autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [bill, autoPrint]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (isError || !bill) return <div className="min-h-screen flex items-center justify-center text-red-500">Invoice not found.</div>;

  const isCancelled = bill.status === 'cancelled';
  const isInterState = bill.isInterState ?? false;
  const hasPaise = (bill.grandTotalPaise ?? 0) > 0;

  // Normalise totals — prefer paise, fall back to float × 100
  const subtotalP   = hasPaise ? (bill.taxablePaise ?? Math.round((bill.subtotal ?? 0) * 100)) : Math.round((bill.subtotal ?? 0) * 100);
  const billDiscP   = bill.billDiscountAmtPaise ?? 0;
  const chargesP    = (bill.charges ?? []).reduce((s: number, c: any) => s + Math.round((c.amtRupees ?? 0) * 100), 0);
  const cgstP       = hasPaise ? (bill.cgstTotalPaise ?? 0) : 0;
  const sgstP       = hasPaise ? (bill.sgstTotalPaise ?? 0) : 0;
  const igstP       = hasPaise ? (bill.igstTotalPaise ?? 0) : 0;
  const totalGstP   = hasPaise ? cgstP + sgstP + igstP : Math.round((bill.totalGst ?? 0) * 100);
  const roundOffP   = bill.roundOffPaise ?? 0;
  const grandP      = hasPaise ? (bill.grandTotalPaise ?? 0) : Math.round((bill.grandTotal ?? 0) * 100);
  const paidP       = hasPaise ? (bill.amountPaidPaise ?? 0) : Math.round((bill.amountPaid ?? 0) * 100);
  const dueP        = hasPaise ? (bill.amountDuePaise ?? 0) : Math.round((bill.amountDue ?? 0) * 100);

  const gstSummary = buildGstSummary(bill.items ?? [], isInterState);
  const invoiceDate = bill.invoiceDate ?? bill.createdAt;

  return (
    <>
      {/* Print controls */}
      <div className="print:hidden flex items-center gap-3 p-3 border-b bg-white sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => router.push('/billing/customers')} className="text-gray-600">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white">
          <Printer className="h-4 w-4 mr-1.5" /> Print
        </Button>
        {!isCancelled && (
          <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setShowCancel(true)}>
            <XCircle className="h-4 w-4 mr-1.5" /> Cancel Invoice
          </Button>
        )}
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full border font-medium ${isCancelled ? 'text-gray-500 bg-gray-50 border-gray-200' : STATUS_STYLE[bill.paymentStatus]}`}>
          {isCancelled ? 'Cancelled' : bill.paymentStatus === 'paid' ? 'Paid' : bill.paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid'}
        </span>
      </div>

      {/* A4 canvas */}
      <div className="bg-[#f0f0f0] print:bg-white py-8 print:py-0 flex justify-center min-h-screen">
        <div id="invoice" style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: '#1a1a1a' }}
          className="bg-white w-[210mm] min-h-[297mm] p-[10mm] print:shadow-none shadow-md">

          {/* Cancelled banner */}
          {isCancelled && (
            <div className="text-center text-red-600 font-bold text-xl border-2 border-red-400 py-2 mb-4 tracking-widest">
              CANCELLED
            </div>
          )}

          {/* ── Header ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <tbody>
              <tr>
                <td style={{ width: '60%', verticalAlign: 'top', paddingRight: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1a6b3c' }}>{SELLER.name}</div>
                  <div style={{ fontSize: 9, color: '#555' }}>{SELLER.legal}</div>
                  <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{SELLER.addr}</div>
                  <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                    Ph: {SELLER.phone} · {SELLER.email}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2 }}>
                    GSTIN: <b>{SELLER.gstin}</b> &nbsp;|&nbsp; State: {SELLER.stateCode} – {SELLER.state}
                  </div>
                </td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', letterSpacing: 1 }}>TAX INVOICE</div>
                  <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Invoice No: <b>{bill.invoiceNo}</b></div>
                  <div style={{ fontSize: 9, color: '#555' }}>Date: <b>{fmtDate(invoiceDate)}</b></div>
                  {bill.paymentMode && (
                    <div style={{ fontSize: 9, color: '#555' }}>
                      Payment: <b style={{ textTransform: 'capitalize' }}>{bill.paymentMode}</b>
                    </div>
                  )}
                  {bill.placeOfSupply && (
                    <div style={{ fontSize: 9, color: '#555' }}>
                      Place of Supply: <b>{bill.placeOfSupply} – {isInterState ? 'Interstate' : SELLER.state}</b>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ borderTop: '2px solid #1a6b3c', marginBottom: 6 }} />

          {/* ── Bill-to / Ship-to ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
            <tbody>
              <tr>
                <td style={{ width: '50%', verticalAlign: 'top', paddingRight: 8 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Bill To</div>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{bill.customerName}</div>
                  <div style={{ color: '#444', fontSize: 9 }}>{bill.customerPhone}</div>
                  {bill.customerGstNo && (
                    <div style={{ fontSize: 9 }}>GSTIN: <b>{bill.customerGstNo}</b></div>
                  )}
                  {bill.billingAddress && <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{bill.billingAddress}</div>}
                </td>
                {!bill.sameAsBilling && bill.shippingAddress && (
                  <td style={{ verticalAlign: 'top', paddingLeft: 8, borderLeft: '1px dashed #ccc' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Ship To</div>
                    <div style={{ fontWeight: 700, fontSize: 11 }}>{bill.customerName}</div>
                    <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{bill.shippingAddress}</div>
                  </td>
                )}
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Order Type</div>
                  <div style={{ fontWeight: 600, fontSize: 10 }}>{bill.orderTag}</div>
                  {bill.gstr1Section && (
                    <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>GSTR-1: {bill.gstr1Section}</div>
                  )}
                  {isInterState && (
                    <div style={{ fontSize: 9, color: '#c05', marginTop: 2 }}>⚡ Inter-State (IGST)</div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ borderTop: '1px solid #ccc', marginBottom: 6 }} />

          {/* ── Items table ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6, fontSize: 9 }}>
            <thead>
              <tr style={{ background: '#1a6b3c', color: '#fff' }}>
                <th style={TH}>#</th>
                <th style={{ ...TH, textAlign: 'left', width: '28%' }}>Description</th>
                <th style={TH}>HSN</th>
                <th style={TH}>MRP</th>
                <th style={TH}>Qty</th>
                <th style={TH}>Unit</th>
                <th style={TH}>Rate (Excl)</th>
                <th style={TH}>Taxable</th>
                {isInterState ? (
                  <th style={TH} colSpan={2}>IGST</th>
                ) : (
                  <>
                    <th style={TH} colSpan={2}>CGST</th>
                    <th style={TH} colSpan={2}>SGST</th>
                  </>
                )}
                <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
              </tr>
              <tr style={{ background: '#d4edda', fontSize: 8 }}>
                <th style={TH}></th>
                <th style={{ ...TH, textAlign: 'left' }}></th>
                <th style={TH}></th>
                <th style={TH}></th>
                <th style={TH}></th>
                <th style={TH}></th>
                <th style={TH}>(₹)</th>
                <th style={TH}>(₹)</th>
                {isInterState ? (
                  <><th style={TH}>%</th><th style={TH}>₹</th></>
                ) : (
                  <><th style={TH}>%</th><th style={TH}>₹</th><th style={TH}>%</th><th style={TH}>₹</th></>
                )}
                <th style={{ ...TH, textAlign: 'right' }}>(₹)</th>
              </tr>
            </thead>
            <tbody>
              {(bill.items ?? []).map((it: any, i: number) => {
                const taxable = it.taxable != null ? p2r(it.taxable) : (it.taxableAmount ?? 0);
                const cgst    = it.cgst   != null ? p2r(it.cgst)   : 0;
                const sgst    = it.sgst   != null ? p2r(it.sgst)   : 0;
                const igst    = it.igst   != null ? p2r(it.igst)   : 0;
                const total   = it.total  != null ? (hasPaise ? p2r(it.total) : it.total) : it.total ?? 0;
                const rate    = it.rate   ?? it.unitPrice ?? 0;
                const half    = (it.gstRate ?? 0) / 2;
                return (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#f9fbf9' : '#fff', borderBottom: '1px solid #e8e8e8' }}>
                    <td style={TD}>{i + 1}</td>
                    <td style={{ ...TD, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace' }}>{it.sku}</div>
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace' }}>{it.hsnCode || '—'}</td>
                    <td style={TD}>{it.mrp > 0 ? inr(it.mrp) : '—'}</td>
                    <td style={TD}>{it.qty}</td>
                    <td style={TD}>{it.unit ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{inr(rate)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{inr(taxable)}</td>
                    {isInterState ? (
                      <><td style={TD}>{it.gstRate ?? 0}%</td><td style={{ ...TD, textAlign: 'right' }}>{inr(igst)}</td></>
                    ) : (
                      <><td style={TD}>{half}%</td><td style={{ ...TD, textAlign: 'right' }}>{inr(cgst)}</td>
                        <td style={TD}>{half}%</td><td style={{ ...TD, textAlign: 'right' }}>{inr(sgst)}</td></>
                    )}
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{inr(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Amount in words + Totals ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
            <tbody>
              <tr>
                {/* Left: GST summary */}
                <td style={{ width: '55%', verticalAlign: 'top', paddingRight: 12 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#888', marginBottom: 3 }}>
                    Tax Summary
                  </div>
                  <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#1a6b3c', color: '#fff' }}>
                        <th style={TH}>GST%</th>
                        <th style={TH}>Taxable (₹)</th>
                        {isInterState ? (
                          <><th style={TH}>IGST%</th><th style={TH}>IGST (₹)</th></>
                        ) : (
                          <><th style={TH}>CGST%</th><th style={TH}>CGST (₹)</th>
                            <th style={TH}>SGST%</th><th style={TH}>SGST (₹)</th></>
                        )}
                        <th style={TH}>Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gstSummary.map(g => (
                        <tr key={g.rate} style={{ borderBottom: '1px solid #e8e8e8' }}>
                          <td style={TD}>{g.rate}%</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{inr(p2r(g.taxable))}</td>
                          {isInterState ? (
                            <><td style={TD}>{g.rate}%</td><td style={{ ...TD, textAlign: 'right' }}>{inrP(g.igst)}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>{inrP(g.igst)}</td></>
                          ) : (
                            <><td style={TD}>{g.rate / 2}%</td><td style={{ ...TD, textAlign: 'right' }}>{inrP(g.cgst)}</td>
                              <td style={TD}>{g.rate / 2}%</td><td style={{ ...TD, textAlign: 'right' }}>{inrP(g.sgst)}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>{inrP(g.cgst + g.sgst)}</td></>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ marginTop: 8, fontSize: 9, color: '#444' }}>
                    <b>Amount in Words:</b>
                    <div style={{ fontStyle: 'italic', marginTop: 2, color: '#222' }}>
                      {amountInWords(grandP)}
                    </div>
                  </div>

                  {/* Bank details */}
                  <div style={{ marginTop: 8, fontSize: 9, borderTop: '1px dashed #ccc', paddingTop: 6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Bank Details</div>
                    <div>{INVOICE_BANK.name}</div>
                    <div>A/C: <b>{INVOICE_BANK.account}</b> &nbsp;|&nbsp; IFSC: <b>{INVOICE_BANK.ifsc}</b></div>
                    <div>A/C Holder: {INVOICE_BANK.holder}</div>
                  </div>
                </td>

                {/* Right: totals */}
                <td style={{ verticalAlign: 'top' }}>
                  <table style={{ width: '100%', fontSize: 9.5, borderCollapse: 'collapse' }}>
                    <tbody>
                      <TRow label="Taxable Amount" value={inr(p2r(subtotalP))} />
                      {billDiscP > 0 && <TRow label={`Bill Discount (${bill.billDiscountPct ?? 0}%)`} value={`–${inrP(billDiscP)}`} red />}
                      {chargesP > 0 && <TRow label="Additional Charges" value={inrP(chargesP)} />}
                      {isInterState ? (
                        totalGstP > 0 && <TRow label="IGST" value={inr(p2r(totalGstP))} />
                      ) : (
                        <>
                          {cgstP > 0 && <TRow label="CGST" value={inrP(cgstP)} />}
                          {sgstP > 0 && <TRow label="SGST" value={inrP(sgstP)} />}
                        </>
                      )}
                      {roundOffP !== 0 && <TRow label="Round Off" value={(roundOffP > 0 ? '+' : '') + inrP(roundOffP)} />}
                      <tr>
                        <td colSpan={2}><div style={{ borderTop: '2px solid #1a6b3c', margin: '3px 0' }} /></td>
                      </tr>
                      <TRow label="Grand Total" value={inrP(grandP)} bold green />
                      {paidP > 0 && <TRow label="Amount Paid" value={inrP(paidP)} />}
                      {dueP > 0 && <TRow label="Balance Due" value={inrP(dueP)} red bold />}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── Terms & Notes ── */}
          {(bill.terms || bill.notes) && (
            <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 6, marginBottom: 6, fontSize: 9 }}>
              {bill.terms && (
                <div><b>Terms &amp; Conditions:</b> {bill.terms}</div>
              )}
              {bill.notes && (
                <div style={{ marginTop: 2, color: '#666' }}>Note: {bill.notes}</div>
              )}
            </div>
          )}

          {/* ── Cancel reason ── */}
          {isCancelled && bill.cancelReason && (
            <div style={{ borderTop: '1px solid #f5c6c6', background: '#fff5f5', padding: '6px 8px', marginBottom: 6, fontSize: 9, color: '#c0392b' }}>
              <b>Cancellation Reason:</b> {bill.cancelReason}
            </div>
          )}

          {/* ── Footer / signature ── */}
          <div style={{ borderTop: '1px solid #ccc', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888', marginTop: 'auto' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#333', marginBottom: 2 }}>Thank you for your purchase!</div>
              <div>{SELLER.name} · {SELLER.addr.split(',').slice(-2).join(',').trim()}</div>
              <div>Subject to Raipur jurisdiction · E.&amp;O.E.</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>For {SELLER.name}</div>
              <div style={{ height: 36, borderBottom: '1px solid #888', width: 100, marginTop: 4, marginLeft: 'auto' }} />
              <div style={{ marginTop: 4 }}>Authorised Signatory</div>
            </div>
          </div>

          {/* ── Reverse charge declaration (Rule 46) ── */}
          <div style={{ marginTop: 6, fontSize: 8, color: '#999', textAlign: 'center' }}>
            Tax is not payable on reverse charge basis · This is a computer-generated invoice
          </div>
        </div>
      </div>

      {showCancel && <CancelDialog billId={id} onClose={() => setShowCancel(false)} />}

      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #invoice { box-shadow: none !important; }
        }
      `}</style>
    </>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  background: '#1a6b3c', color: '#fff', padding: '4px 3px', fontSize: 8.5,
  fontWeight: 700, border: '1px solid #155534', textAlign: 'center',
};
const TD: React.CSSProperties = {
  padding: '3px 4px', border: '1px solid #e8e8e8', textAlign: 'center', verticalAlign: 'middle',
};

function TRow({ label, value, bold, red, green }: { label: string; value: string; bold?: boolean; red?: boolean; green?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '3px 4px', color: '#555', fontSize: 9.5 }}>{label}</td>
      <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: bold ? 700 : 400, color: red ? '#c0392b' : green ? '#1a6b3c' : '#1a1a1a', fontSize: bold ? 11 : 9.5 }}>
        {value}
      </td>
    </tr>
  );
}
