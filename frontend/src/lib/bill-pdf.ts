import type { Order, StoreSale } from '@/types';

const SELLER = {
  name: 'NATURE LITE FOODS (SUHIKA PVT LTD)',
  addr: 'B7, Ground Floor, Sector-1, Avanti Vihar, Raipur-492001',
  phone: '8817200740',
  email: 'naturelite2021@gmail.com',
  gstin: '22ABJCS3598L1ZR',
};

const BANK = {
  name: 'ICICI Bank Limited, Raipur Dumartarai',
  account: '429705000519',
  ifsc: 'ICIC0004297',
  holder: 'SUHIKA PVT LTD',
};

const G = '#1a6b3c';
const LG = '#e8f5ee';
const MUTED = '#555555';
const BORDER = '#cccccc';
const W = 210;
const M = 14;
const CW = W - M * 2;

function safe(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '');
}

function inr(n: number): string {
  return safe(new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n));
}

function fmtDate(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
}

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
  const int = Math.floor(n);
  const dec = Math.floor((n - int) * 100);
  return (w(int).trim() || 'Zero') + ' Rupees' + (dec ? ' and ' + w(dec).trim() + ' Paise' : '') + ' Only';
}

interface BillItem {
  name: string;
  qty: number;
  price: number;
  gstAmt: number;
  total: number;
}

interface BillData {
  docNumber: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  customerAddr?: string;
  items: BillItem[];
  subtotal: number;
  discount: number;
  gstTotal: number;
  total: number;
}

async function renderBill(data: BillData): Promise<string> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const H = pdf.internal.pageSize.getHeight();
  let y = M;

  // ── helpers ──────────────────────────────────────────────────────────────
  const hline = (yy: number, color = BORDER) => {
    pdf.setDrawColor(color);
    pdf.setLineWidth(0.3);
    pdf.line(M, yy, M + CW, yy);
  };
  const fillRect = (x: number, yy: number, w: number, h: number, color: string) => {
    pdf.setFillColor(color);
    pdf.rect(x, yy, w, h, 'F');
  };
  const text = (t: string, x: number, yy: number, opts?: { align?: 'left' | 'center' | 'right'; color?: string; bold?: boolean; size?: number }) => {
    pdf.setTextColor(opts?.color ?? '#111111');
    pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts?.size ?? 9);
    pdf.text(safe(t), x, yy, { align: opts?.align ?? 'left' });
  };

  // ── Header band ──────────────────────────────────────────────────────────
  fillRect(0, 0, W, 22, G);
  text('NATURE LITE FOODS', M, 9, { color: '#ffffff', bold: true, size: 14 });
  text('(SUHIKA PVT LTD)', M, 14.5, { color: '#b2dfcc', size: 8.5 });
  text('Tax Invoice / Bill', W - M, 9, { align: 'right', color: '#ffffff', bold: true, size: 11 });
  text(SELLER.addr, W - M, 14.5, { align: 'right', color: '#b2dfcc', size: 7.5 });
  y = 26;

  // ── Invoice meta row ─────────────────────────────────────────────────────
  fillRect(M, y, CW, 16, LG);
  pdf.setDrawColor(G);
  pdf.setLineWidth(0.4);
  pdf.rect(M, y, CW, 16, 'S');
  text('Invoice No:', M + 3, y + 5.5, { color: MUTED, size: 8 });
  text(data.docNumber, M + 3, y + 11, { bold: true, size: 9, color: G });
  text('Date:', M + CW / 3, y + 5.5, { color: MUTED, size: 8 });
  text(data.date, M + CW / 3, y + 11, { bold: true, size: 9 });
  text('GSTIN:', M + (CW * 2) / 3, y + 5.5, { color: MUTED, size: 8 });
  text(SELLER.gstin, M + (CW * 2) / 3, y + 11, { bold: true, size: 9 });
  y += 20;

  // ── Bill to ─────────────────────────────────────────────────────────────
  fillRect(M, y, CW, 6, G);
  text('BILL TO', M + 3, y + 4.2, { color: '#ffffff', bold: true, size: 8.5 });
  y += 8;
  text(data.customerName || 'Walk-in Customer', M + 3, y, { bold: true, size: 9 });
  y += 5;
  if (data.customerPhone) { text(`Phone: ${data.customerPhone}`, M + 3, y, { size: 8.5, color: MUTED }); y += 4.5; }
  if (data.customerAddr) { text(data.customerAddr, M + 3, y, { size: 8.5, color: MUTED }); y += 4.5; }
  y += 3;

  // ── Items table header ───────────────────────────────────────────────────
  const cols = { sn: M, item: M + 8, qty: M + CW * 0.52, price: M + CW * 0.65, gst: M + CW * 0.78, total: M + CW };
  fillRect(M, y, CW, 7, G);
  text('#', cols.sn + 2, y + 4.8, { color: '#fff', bold: true, size: 8 });
  text('Item', cols.item, y + 4.8, { color: '#fff', bold: true, size: 8 });
  text('Qty', cols.qty, y + 4.8, { color: '#fff', bold: true, size: 8 });
  text('Price', cols.price, y + 4.8, { color: '#fff', bold: true, size: 8 });
  text('GST', cols.gst, y + 4.8, { color: '#fff', bold: true, size: 8 });
  text('Amount', cols.total, y + 4.8, { align: 'right', color: '#fff', bold: true, size: 8 });
  y += 8;

  // ── Item rows ─────────────────────────────────────────────────────────────
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    const rowH = 7;
    if (i % 2 === 1) fillRect(M, y, CW, rowH, '#f6fbf8');
    text(String(i + 1), cols.sn + 2, y + 4.8, { size: 8.5 });
    const label = safe(it.name).slice(0, 38);
    text(label, cols.item, y + 4.8, { size: 8.5 });
    text(String(it.qty), cols.qty, y + 4.8, { size: 8.5 });
    text(`Rs.${inr(it.price)}`, cols.price, y + 4.8, { size: 8.5 });
    text(`Rs.${inr(it.gstAmt)}`, cols.gst, y + 4.8, { size: 8.5 });
    text(`Rs.${inr(it.total)}`, cols.total, y + 4.8, { align: 'right', size: 8.5 });
    hline(y + rowH);
    y += rowH;

    if (y > H - 60) {
      pdf.addPage();
      y = M;
    }
  }
  y += 4;

  // ── Totals block ─────────────────────────────────────────────────────────
  const totX = M + CW * 0.55;
  const totW = CW * 0.45;
  const rows: [string, string, boolean][] = [
    ['Subtotal', `Rs.${inr(data.subtotal)}`, false],
    ...(data.discount > 0 ? [['Discount', `-Rs.${inr(data.discount)}`, false] as [string, string, boolean]] : []),
    ['GST', `Rs.${inr(data.gstTotal)}`, false],
    ['TOTAL', `Rs.${inr(data.total)}`, true],
  ];
  for (const [label, val, bold] of rows) {
    if (bold) fillRect(totX, y, totW, 8, G);
    text(label, totX + 3, y + 5.2, { bold, size: bold ? 9.5 : 8.5, color: bold ? '#ffffff' : '#333333' });
    text(val, totX + totW - 2, y + 5.2, { align: 'right', bold, size: bold ? 9.5 : 8.5, color: bold ? '#ffffff' : '#333333' });
    if (!bold) hline(y + 8);
    y += 8;
  }
  y += 6;

  // ── Amount in words ──────────────────────────────────────────────────────
  fillRect(M, y, CW, 6, LG);
  hline(y, G); hline(y + 6, G);
  text('Amount in words: ' + safe(toWords(data.total)), M + 3, y + 4.2, { size: 8, color: G, bold: true });
  y += 10;

  // ── Bank details ─────────────────────────────────────────────────────────
  fillRect(M, y, CW / 2 - 2, 6, G);
  text('BANK DETAILS', M + 3, y + 4.2, { color: '#ffffff', bold: true, size: 8 });
  y += 7;
  for (const [label, val] of [['Bank', BANK.name], ['A/C No', BANK.account], ['IFSC', BANK.ifsc], ['Holder', BANK.holder]]) {
    text(`${label}: `, M + 3, y, { size: 8, color: MUTED });
    text(val, M + 22, y, { size: 8, bold: true });
    y += 4.5;
  }
  y += 4;

  // ── Footer ───────────────────────────────────────────────────────────────
  hline(y, G);
  y += 4;
  text('Thank you for shopping with Nature Lite Foods!', W / 2, y, { align: 'center', color: G, bold: true, size: 9 });
  text(`${SELLER.phone}  |  ${SELLER.email}`, W / 2, y + 5, { align: 'center', color: MUTED, size: 8 });

  return pdf.output('datauristring').split(',')[1];
}

export async function generateOrderBillPdf(order: Order): Promise<string> {
  const fy = new Date(order.createdAt);
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const docNumber = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${order.orderNumber}`;
  const addr = order.shippingAddress;

  const items: BillItem[] = order.items.map((it) => ({
    name: it.variantName ? `${it.name} ${it.variantName}` : it.name,
    qty: it.quantity,
    price: it.price,
    gstAmt: it.gstAmount ?? 0,
    total: it.total,
  }));

  return renderBill({
    docNumber,
    date: fmtDate(order.createdAt),
    customerName: addr?.name ?? '',
    customerPhone: addr?.phone,
    customerAddr: [addr?.street, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', '),
    items,
    subtotal: order.subtotal ?? order.total,
    discount: order.discount ?? 0,
    gstTotal: order.gstTotal ?? 0,
    total: order.total,
  });
}

export async function generateSaleBillPdf(sale: StoreSale): Promise<string> {
  const items: BillItem[] = (sale.items ?? []).map((it) => ({
    name: it.variantName ? `${it.name} ${it.variantName}` : it.name,
    qty: it.quantity,
    price: it.price,
    gstAmt: 0,
    total: it.total,
  }));

  return renderBill({
    docNumber: sale.saleNumber,
    date: fmtDate(sale.createdAt),
    customerName: sale.customerName ?? 'Walk-in Customer',
    customerPhone: sale.customerPhone,
    customerAddr: sale.customerAddress,
    items,
    subtotal: sale.subtotal ?? sale.total,
    discount: sale.discount ?? 0,
    gstTotal: 0,
    total: sale.total,
  });
}

export function billFilename(docNumber: string): string {
  return `Bill_${docNumber.replace(/[/\\:*?"<>|]/g, '-')}.pdf`;
}

export function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
