'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect, Suspense } from 'react';
import { Printer, Download, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { StoreSale, SaleItem, Product } from '@/types';

const SELLER = {
  name: 'NATURE LITE FOODS',
  legal: '(SUHIKA PVT LTD)',
  addr: 'B7, GROUND FLOOR, SECTOR-1, AVANTI VIHAR, RAIPUR-492001 (NEAR ATM CHOWK)',
  phone: '8817200740',
  email: 'naturelite2021@gmail.com',
  gstin: '22ABJCS3598L1ZR',
  state: 'Chhattisgarh',
  stateCode: '22',
};

const BANK = {
  name: 'ICICI BANK LIMITED, RAIPUR DUMARTARAI',
  account: '429705000519',
  ifsc: 'ICIC0004297',
  holder: 'SUHIKA PVT LTD',
};

const INR = (n: number, dec = 3) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

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
  let int = Math.floor(n);
  let dec = Math.floor((n - int) * 100);
  if (dec >= 100) { int += 1; dec = 0; }
  return (w(int).trim() || 'Zero') + ' Rupees' + (dec ? ' and ' + w(dec).trim() + ' Paise' : '') + ' Only';
}

function getProduct(item: SaleItem): Product | null {
  return typeof item.product === 'object' ? item.product as Product : null;
}

function itemGst(item: SaleItem): number {
  const prod = getProduct(item);
  const rate = prod?.gstPercentage ?? 0;
  if (!rate) return 0;
  return item.total - item.total / (1 + rate / 100);
}

const G = '#1a6b3c';
const LG = '#e8f5ee';
const BD = '#c8c8c8';

const TH: React.CSSProperties = {
  background: G, color: '#fff', padding: '6px 4px', fontSize: 9.5,
  fontWeight: 700, border: `1px solid ${BD}`, textAlign: 'center',
};
const TD: React.CSSProperties = {
  padding: '5px 4px', fontSize: 10, border: `1px solid ${BD}`,
  verticalAlign: 'middle', textAlign: 'center',
};

const SALE_TYPE_LABELS: Record<string, string> = {
  walk_in: 'Walk-in', delivery: 'Delivery', website: 'Website',
};

function SaleInvoiceInner() {
  const { saleId } = useParams<{ saleId: string }>();
  const searchParams = useSearchParams();
  const storeId = searchParams.get('storeId') || undefined;
  const captureMode = searchParams.get('mode') === 'capture';
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: sale, isLoading } = useQuery<StoreSale>({
    queryKey: ['invoice-sale', saleId, storeId],
    queryFn: () => api.getSaleById(saleId, storeId),
  });

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!invoiceRef.current || !sale) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      const fy = new Date(sale.createdAt);
      const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
      const invoiceSlug = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)} ${sale.saleNumber}`;
      const dateStr = fmtDate(sale.createdAt).replace(/\//g, '-');
      const customerName = sale.customerName ?? 'Walk-in';
      pdf.save(`${customerName}_${invoiceSlug}_${dateStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  // When opened in capture mode (from admin panel), auto-generate PDF and post back
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!captureMode || !sale || !invoiceRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
          import('jspdf'),
          import('html2canvas'),
        ]);
        const canvas = await html2canvas(invoiceRef.current!, {
          scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        const base64 = pdf.output('datauristring').split(',')[1];
        window.opener?.postMessage({ type: 'INVOICE_PDF_READY', id: saleId, base64 }, window.location.origin);
      } catch (err) {
        window.opener?.postMessage({ type: 'INVOICE_PDF_ERROR', id: saleId, error: String(err) }, window.location.origin);
      } finally {
        window.close();
      }
    }, 900);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureMode, sale]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #d1fae5', borderTopColor: G, animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: '#666', fontSize: 13 }}>Loading invoice…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!sale) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Sale not found.</div>;

  const fy = new Date(sale.createdAt);
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${sale.saleNumber}`;
  const placeOfSupply = `${SELLER.stateCode}-${SELLER.state}`;
  const total = sale.total ?? 0;

  // Build per-rate tax groups
  const taxGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  for (const item of sale.items) {
    const prod = getProduct(item);
    const gstRate = prod?.gstPercentage ?? 0;
    if (gstRate > 0) {
      const gstAmt = itemGst(item);
      const taxable = item.total - gstAmt;
      const half = gstAmt / 2;
      const prev = taxGroups.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
      taxGroups.set(gstRate, { taxable: prev.taxable + taxable, cgst: prev.cgst + half, sgst: prev.sgst + half });
    }
  }
  const taxRows = Array.from(taxGroups.entries()).sort((a, b) => b[0] - a[0]);

  // Sales are always fully paid (recorded sale = collected payment)
  const amountRows: { label: string; val: string; bold?: boolean }[] = [
    { label: 'Sub Total', val: INR(total) },
    { label: 'Total', val: INR(total), bold: true },
    { label: 'Advance', val: INR(total) },
    { label: 'Balance', val: INR(0) },
  ];

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

      {/* Toolbar */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ fontWeight: 700, color: G, fontSize: 14 }}>Sale Order — {sale.saleNumber}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, background: LG, color: G, border: `1px solid ${BD}`, borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={14} /> Print
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: G, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.7 : 1 }}>
            <Download size={14} /> {downloading ? 'Generating…' : 'Download PDF'}
          </button>
          <button onClick={() => window.close()} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', color: '#666', border: '1px solid #e5e7eb', borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 16px 40px', minHeight: '100vh' }}>
        <div
          ref={invoiceRef}
          className="inv-page"
          style={{
            maxWidth: 800, margin: '0 auto', background: '#fff',
            borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,.10)',
            fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1a1a1a', fontSize: 11,
            border: `1px solid ${BD}`,
          }}
        >

          {/* Title */}
          <div style={{ textAlign: 'center', padding: '10px 0 8px', fontSize: 15, fontWeight: 700, letterSpacing: 0.5 }}>
            Sale Order
          </div>

          {/* Company Header: logo left, info right */}
          <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0 16px 12px', gap: 12, borderBottom: `1px solid ${BD}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Nature Lite Foods" style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: 'right', fontSize: 10.5, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{SELLER.name} {SELLER.legal}</div>
              <div>{SELLER.name}, {SELLER.addr}</div>
              <div>Phone no.: {SELLER.phone} Email: {SELLER.email}</div>
              <div>GSTIN: {SELLER.gstin}, State: {SELLER.stateCode}-{SELLER.state}</div>
            </div>
          </div>

          {/* Three-panel header */}
          <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${BD}` }}>
            <tbody>
              <tr>
                <td style={{ width: '33%', background: G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BD}` }}>Order From</td>
                <td style={{ width: '34%', background: G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BD}` }}>Ship To</td>
                <td style={{ width: '33%', background: G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>Order Details</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', border: `1px solid ${BD}`, verticalAlign: 'top', fontSize: 11, lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 600 }}>{sale.customerName ?? 'Walk-in Customer'}</div>
                  {sale.customerPhone && <div>Contact No.: {sale.customerPhone}</div>}
                  <div>State: {placeOfSupply}</div>
                </td>
                <td style={{ padding: '8px', border: `1px solid ${BD}`, verticalAlign: 'top', fontSize: 11, lineHeight: 1.7 }}>
                  {sale.customerAddress ?? sale.customerName ?? '–'}
                </td>
                <td style={{ padding: '8px', border: `1px solid ${BD}`, verticalAlign: 'top', fontSize: 11 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {([
                        ['Order No.:', invoiceNo, false],
                        ['Date:', fmtDate(sale.createdAt), false],
                        ['Time:', fmtTime(sale.createdAt), false],
                        ['Place of Supply:', placeOfSupply, false],
                        ['Sale Type:', SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType, true],
                      ] as [string, string, boolean][]).map(([k, v, bold]) => (
                        <tr key={k}>
                          <td style={{ color: '#555', padding: '1px 4px 1px 0', whiteSpace: 'nowrap', fontSize: 10.5 }}>{k}</td>
                          <td style={{ textAlign: 'right', fontWeight: bold ? 700 : 400, fontSize: 10.5 }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {(['#', 'Item name', 'HSN/\nSAC', 'MRP', 'Quantity', 'Price/\nUnit', 'Taxable\namount', 'CGST', 'SGST', 'Final Rate', 'Amount'] as string[]).map((h, i) => (
                  <th key={h} style={{ ...TH, textAlign: i === 1 ? 'left' : 'center', whiteSpace: 'pre-line', lineHeight: 1.2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item: SaleItem, idx: number) => {
                const prod = getProduct(item);
                const hsn = prod?.hsnCode ?? '';
                const gstRate = prod?.gstPercentage ?? 0;
                const gstAmt = itemGst(item);
                const taxableAmt = item.total - gstAmt;
                const pricePerUnit = item.quantity > 0 ? taxableAmt / item.quantity : 0;
                const cgst = gstAmt / 2;
                const sgst = gstAmt / 2;
                const mrp = prod?.compareAtPrice ?? item.price;
                return (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ ...TD, width: '3%' }}>{idx + 1}</td>
                    <td style={{ ...TD, textAlign: 'left', width: '20%' }}>
                      {item.name}{item.variantName ? ` ${item.variantName}` : ''}
                    </td>
                    <td style={{ ...TD, width: '7%' }}>{hsn}</td>
                    <td style={{ ...TD, width: '7%' }}>{INR(mrp)}</td>
                    <td style={{ ...TD, width: '5%' }}>{item.quantity}</td>
                    <td style={{ ...TD, width: '8%' }}>₹ {INR(pricePerUnit)}</td>
                    <td style={{ ...TD, width: '9%' }}>₹ {INR(taxableAmt)}</td>
                    <td style={{ ...TD, width: '7%' }}>₹ {INR(cgst)}</td>
                    <td style={{ ...TD, width: '7%' }}>₹ {INR(sgst)}</td>
                    <td style={{ ...TD, width: '8%' }}>
                      ₹ {INR(item.price)}
                    </td>
                    <td style={{ ...TD, width: '8%' }}>
                      ₹ {INR(item.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tax Summary | Amounts */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                {/* Tax table */}
                <td style={{ width: '55%', padding: 0, border: `1px solid ${BD}`, verticalAlign: 'top' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {(['Tax type', 'Taxable amount', 'Rate', 'Tax amount'] as string[]).map((h, i) => (
                          <th key={h} style={{ background: LG, color: G, padding: '5px 6px', fontSize: 10, fontWeight: 700, border: `1px solid ${BD}`, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {taxRows.length > 0 ? taxRows.flatMap(([rate, { taxable, cgst, sgst }]) => [
                        <tr key={`sgst-${rate}`}>
                          <td style={{ ...TD, textAlign: 'left' }}>SGST</td>
                          <td style={{ ...TD, textAlign: 'right' }}>₹ {INR(taxable)}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{(rate / 2).toFixed(1)}%</td>
                          <td style={{ ...TD, textAlign: 'right' }}>₹ {INR(sgst)}</td>
                        </tr>,
                        <tr key={`cgst-${rate}`}>
                          <td style={{ ...TD, textAlign: 'left' }}>CGST</td>
                          <td style={{ ...TD, textAlign: 'right' }}>₹ {INR(taxable)}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{(rate / 2).toFixed(1)}%</td>
                          <td style={{ ...TD, textAlign: 'right' }}>₹ {INR(cgst)}</td>
                        </tr>,
                      ]) : (
                        <tr>
                          <td colSpan={4} style={{ ...TD, fontStyle: 'italic', color: '#888' }}>No GST applicable</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </td>

                {/* Amounts */}
                <td style={{ width: '45%', padding: 0, border: `1px solid ${BD}`, verticalAlign: 'top' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th colSpan={2} style={{ background: LG, color: G, padding: '5px 8px', fontSize: 10, fontWeight: 700, border: `1px solid ${BD}`, textAlign: 'left' }}>Amounts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amountRows.map(({ label, val, bold }) => (
                        <tr key={label}>
                          <td style={{ ...TD, textAlign: 'left', fontWeight: bold ? 700 : 400 }}>{label}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: bold ? 700 : 400 }}>₹ {val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Amount in Words */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ background: G, color: '#fff', padding: '5px 8px', fontSize: 10, fontWeight: 700, border: `1px solid ${BD}`, textAlign: 'center' }}>
                  Order Amount In Words
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${BD}`, textAlign: 'center' }}>
                  {toWords(total)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Bank Details | Terms */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%', padding: 0, border: `1px solid ${BD}`, verticalAlign: 'top' }}>
                  <div style={{ background: G, color: '#fff', fontWeight: 700, fontSize: 10, padding: '5px 8px' }}>Bank Details</div>
                  <div style={{ padding: '8px 10px', fontSize: 10.5, lineHeight: 1.8 }}>
                    <div><strong>Name:</strong> {BANK.name}</div>
                    <div><strong>Account No.:</strong> {BANK.account}</div>
                    <div><strong>IFSC code:</strong> {BANK.ifsc}</div>
                    <div><strong>Account Holder&apos;s Name:</strong> {BANK.holder}</div>
                  </div>
                </td>
                <td style={{ width: '50%', padding: 0, border: `1px solid ${BD}`, verticalAlign: 'top' }}>
                  <div style={{ background: G, color: '#fff', fontWeight: 700, fontSize: 10, padding: '5px 8px' }}>Terms and conditions</div>
                  <div style={{ padding: '8px 10px', fontSize: 10.5 }}>Thanks for doing business with us!</div>
                </td>
              </tr>
            </tbody>
          </table>

        </div>
      </div>
    </>
  );
}

export default function SaleInvoicePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
        <div style={{ color: '#666', fontSize: 13 }}>Loading…</div>
      </div>
    }>
      <SaleInvoiceInner />
    </Suspense>
  );
}
