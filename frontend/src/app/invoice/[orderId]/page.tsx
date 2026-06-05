'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Printer, Download, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order, OrderItem } from '@/types';

// ─── Seller Details ────────────────────────────────────────────────────────────
const SELLER = {
  name: 'NATURELITE FOODS',
  legal: '(NATURELITE PVT LTD)',
  addr1: 'B7, Ground Floor, Sector-1',
  addr2: 'Hinganghat, Wardha District',
  addr3: 'Maharashtra – 442 301',
  phone: '8817200740',
  gstin: '22AABCN3598L1ZR',   // ← update with actual GSTIN once registered
  state: 'Maharashtra',
  stateCode: '27',
  email: 'hello@naturelite.in',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const INR = (n: number, dec = 3) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

const dt = (d: string | Date) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery', prepaid: 'Online Payment',
  upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet',
};

function toWords(n: number): string {
  const o = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function w(x: number): string {
    if (!x) return '';
    if (x < 20) return o[x] + ' ';
    if (x < 100) return t[Math.floor(x / 10)] + (x % 10 ? ' ' + o[x % 10] : '') + ' ';
    if (x < 1000) return o[Math.floor(x / 100)] + ' Hundred ' + w(x % 100);
    if (x < 100000) return w(Math.floor(x / 1000)) + 'Thousand ' + w(x % 1000);
    if (x < 10000000) return w(Math.floor(x / 100000)) + 'Lakh ' + w(x % 100000);
    return w(Math.floor(x / 10000000)) + 'Crore ' + w(x % 10000000);
  }
  // Use floor+clamp to avoid floating-point edge case where 0.999… rounds to 100 paise
  let int = Math.floor(n);
  let dec = Math.floor((n - int) * 100);
  if (dec >= 100) { int += 1; dec = 0; }
  return (w(int).trim() || 'Zero') + ' Rupees' + (dec ? ' and ' + w(dec).trim() + ' Paise' : '') + ' Only';
}

function getProduct(item: OrderItem) {
  return typeof item.product === 'object' ? item.product : null;
}

// ─── Styles (inline so print/html2canvas picks them up) ────────────────────────
const S = {
  green: '#1a6b3c',
  lightGreen: '#e8f5ee',
  border: '#d1e8db',
  text: '#1a1a1a',
  muted: '#666',
  page: { fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1a1a1a', fontSize: 12 } as React.CSSProperties,
  label: { fontSize: 10, color: '#1a6b3c', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 5 },
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ['invoice-order', orderId],
    queryFn: () => api.getOrder(orderId),
  });

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!invoiceRef.current || !order) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      pdf.save(`Invoice-${order.orderNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #d1fae5', borderTopColor: S.green, animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: '#666', fontSize: 13 }}>Loading invoice…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (isError) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Failed to load order. Please try again.</div>;
  if (!order) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Order not found.</div>;

  const addr = order.shippingAddress ?? ({} as typeof order.shippingAddress);
  const fy = order.createdAt ? new Date(order.createdAt) : new Date();
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${order.orderNumber}`;

  const totalQty = order.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const gstTotal = order.gstTotal ?? 0;
  const cgst = gstTotal / 2;
  const sgst = gstTotal / 2;
  const subtotal = order.subtotal ?? 0;
  const total = order.total ?? 0;
  const discount = order.discount ?? 0;
  const shippingCharge = order.shippingCharge ?? 0;
  const gstRatePct = subtotal > 0 && gstTotal > 0
    ? Math.round((gstTotal / subtotal) * 100)
    : 0;
  const halfRate = gstRatePct / 2;
  const discountPct = subtotal > 0 && discount > 0
    ? (discount / subtotal) * 100
    : 0;
  const itemDiscount = (item: OrderItem) =>
    subtotal > 0 && discount > 0 ? (item.total / subtotal) * discount : 0;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f2f5; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .inv-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
          @page { size: A4 portrait; margin: 6mm 8mm; }
        }
      `}</style>

      {/* ── Top toolbar ──────────────────────────────────────────── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ fontWeight: 700, color: S.green, fontSize: 14 }}>GST Tax Invoice — {order.orderNumber}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0faf4', color: S.green, border: `1px solid ${S.border}`, borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Printer size={14} /> Print
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: S.green, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.7 : 1 }}
          >
            <Download size={14} /> {downloading ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            onClick={() => window.close()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', color: '#666', border: '1px solid #e5e7eb', borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Invoice document ─────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 40px', minHeight: '100vh' }}>
        <div
          ref={invoiceRef}
          className="inv-page"
          style={{ ...S.page, maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,.10)', overflow: 'hidden' }}
        >

          {/* ── Amount Due Banner ─────────────────────────────────── */}
          <div style={{ background: S.green, color: '#fff', padding: '16px 28px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10.5, opacity: 0.75, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Amount Due</div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>
                ₹ {INR(total)}
              </div>
            </div>
            <div style={{ textAlign: 'right', opacity: 0.85, fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>TAX INVOICE</div>
              <div>{invoiceNo}</div>
            </div>
          </div>

          {/* ── Seller Info + Logo ────────────────────────────────── */}
          <div style={{ padding: '18px 28px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: S.text, letterSpacing: 0.3 }}>{SELLER.name}</div>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>{SELLER.legal}</div>
              <div style={{ color: S.muted, lineHeight: 1.7, fontSize: 11.5 }}>
                {SELLER.addr1},<br />{SELLER.addr2},<br />{SELLER.addr3}
              </div>
              <div style={{ color: S.green, fontWeight: 600, fontSize: 12, marginTop: 5 }}>☎ {SELLER.phone}</div>
              <div style={{ fontSize: 11.5, color: '#444', marginTop: 3 }}>
                <span style={{ color: S.muted }}>Company GST : </span>
                <strong>{SELLER.gstin}</strong>
              </div>
              <div style={{ fontSize: 11, color: S.muted }}>{SELLER.state} (State Code: {SELLER.stateCode})</div>
            </div>

            {/* Logo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.png"
              alt="Nature Lite Foods"
              style={{ flexShrink: 0, width: 78, height: 78, objectFit: 'contain' }}
            />
          </div>

          <div style={{ height: 1, background: S.border, margin: '0 28px' }} />

          {/* ── Bill To | Invoice Meta ────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ padding: '14px 28px' }}>
              <div style={S.label}>Bill To:</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: S.text, marginBottom: 4 }}>{addr.name ?? '–'}</div>
              <div style={{ color: S.muted, lineHeight: 1.75, fontSize: 11.5 }}>
                {addr.street ?? ''}
                {addr.landmark ? `, ${addr.landmark}` : ''}<br />
                {[addr.city, addr.state].filter(Boolean).join(', ')}<br />
                {addr.pincode ? `PIN – ${addr.pincode}` : ''}
              </div>
              <div style={{ color: S.green, fontWeight: 600, fontSize: 12, marginTop: 5 }}>☎ {addr.phone ?? '–'}</div>
              <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{addr.state ?? ''}</div>
            </div>
            <div style={{ padding: '14px 28px', borderLeft: `1px solid ${S.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <tbody>
                  {[
                    ['Invoice No.', invoiceNo],
                    ['Date of Issue', dt(order.createdAt)],
                    ['Payment Mode', PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod],
                    ['Payment Status', order.paymentStatus],
                    ['GODOWN NAME', 'STORE'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: S.green, fontWeight: 600, padding: '3px 10px 3px 0', whiteSpace: 'nowrap' }}>{k}</td>
                      <td style={{ fontWeight: k === 'Invoice No.' ? 700 : 500, color: S.text, padding: '3px 0', textTransform: k === 'Payment Status' ? 'capitalize' : 'none' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Items Table ───────────────────────────────────────── */}
          <div style={{ margin: '0 28px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderTop: `2px solid ${S.green}`, borderBottom: `2px solid ${S.green}`, background: S.lightGreen }}>
                  {['SR', 'Name', 'Qty', 'Price', 'Amount'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left', color: S.green, fontWeight: 700, fontSize: 11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => {
                  const prod = getProduct(item);
                  const hsn = prod?.hsnCode ?? '–';
                  const disc = itemDiscount(item);
                  const gstRate = item.total > 0 ? ((item.gstAmount ?? 0) / item.total) * 100 : 0;
                  const isEven = idx % 2 === 0;
                  return (
                    <tr key={`${typeof item.product === 'object' ? item.product._id : item.product}-${item.variantSku ?? idx}`} style={{ background: isEven ? '#fff' : '#fafcfb', borderBottom: `1px solid ${S.border}` }}>
                      <td style={{ padding: '10px 6px', textAlign: 'center', color: '#999', verticalAlign: 'top', fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: S.text }}>
                          {item.name}{item.variantName ? ` ${item.variantName}` : ''}
                        </div>
                        <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 3 }}>HSN/SAC : {hsn}</div>
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                        <div>{item.quantity} Pac</div>
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                        <div>{INR(item.price)}</div>
                        <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 4 }}>
                          Discount({discountPct > 0 ? discountPct.toFixed(0) : '0'}%):
                        </div>
                        <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 2 }}>
                          GST@{gstRate % 1 === 0 ? gstRate.toFixed(0) : gstRate.toFixed(1)}% :
                        </div>
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top', fontWeight: 600 }}>
                        <div>{INR(item.total)}</div>
                        <div style={{ color: disc > 0 ? '#dc2626' : '#aaa', fontSize: 10.5, marginTop: 4 }}>
                          {disc > 0 ? `– ${INR(disc)}` : '0.000'}
                        </div>
                        <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 2 }}>{INR(item.gstAmount ?? 0)}</div>
                      </td>
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr style={{ borderTop: `2px solid ${S.green}`, background: S.lightGreen }}>
                  <td />
                  <td style={{ padding: '9px 6px', fontWeight: 700, fontSize: 12.5, color: S.green }}>Total</td>
                  <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: S.green }}>{totalQty}</td>
                  <td />
                  <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: S.green }}>{INR(subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Summary + Tax Details ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 28px', gap: 20, borderTop: `1px solid ${S.border}` }}>

            {/* Tax Details */}
            <div>
              <div style={S.label}>Tax Details</div>
              {[
                [`SGST @ ${halfRate}%`, sgst],
                [`CGST @ ${halfRate}%`, cgst],
                ...(shippingCharge > 0 ? [['Shipping', shippingCharge]] : []),
              ].map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: `1px dashed ${S.border}` }}>
                  <span style={{ color: S.muted }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{INR(val as number)}</span>
                </div>
              ))}
            </div>

            {/* Order summary */}
            <div style={{ textAlign: 'right' }}>
              <div style={S.label}>Order Summary</div>
              {[
                ['Subtotal (Taxable)', subtotal],
                ...(discount > 0 ? [['Discount', -discount]] : []),
                [`SGST (${halfRate}%)`, sgst],
                [`CGST (${halfRate}%)`, cgst],
                ...(shippingCharge > 0 ? [['Shipping', shippingCharge]] : [['Shipping', null]]),
              ].map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '2.5px 0' }}>
                  <span style={{ color: S.muted }}>{label}</span>
                  <span style={{ color: (val as number) < 0 ? '#dc2626' : S.text, fontWeight: 500 }}>
                    {val === null ? 'Free' : (val as number) < 0 ? `– ${INR(Math.abs(val as number))}` : INR(val as number)}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${S.green}`, marginTop: 6, paddingTop: 6, fontSize: 14, fontWeight: 700, color: S.green }}>
                <span>Grand Total</span>
                <span>₹ {INR(total)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  <span>🎉 You Saved</span>
                  <span>{INR(discount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Amount in Words ───────────────────────────────────── */}
          <div style={{ background: S.lightGreen, borderTop: `1px solid ${S.border}`, padding: '10px 28px', fontSize: 11.5 }}>
            <strong style={{ color: S.green }}>Amount in Words : </strong>
            <span style={{ fontStyle: 'italic', color: '#444' }}>{toWords(total)}</span>
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={{ padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${S.border}` }}>
            <div>
              <div style={{ fontSize: 12, color: S.muted, fontStyle: 'italic', marginBottom: 8 }}>
                Thanks for doing business with us!
              </div>
              <div style={{ fontSize: 10, color: '#bbb' }}>
                This is a computer-generated invoice and does not require a physical signature.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10.5, color: S.muted, marginBottom: 28 }}>For {SELLER.name}</div>
              <div style={{ borderTop: `1px solid #999`, paddingTop: 4, fontSize: 10.5, color: '#666', minWidth: 130 }}>
                Authorised Signatory
              </div>
            </div>
          </div>

          {/* Green sub-footer */}
          <div style={{ background: S.green, color: '#fff', textAlign: 'center', padding: '7px 20px', fontSize: 10.5, opacity: 0.92, letterSpacing: 0.3 }}>
            {SELLER.email} &nbsp;·&nbsp; {SELLER.addr2} &nbsp;·&nbsp; {SELLER.state}
          </div>
        </div>
      </div>
    </>
  );
}
