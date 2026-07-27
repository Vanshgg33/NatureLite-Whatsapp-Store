'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect, Suspense } from 'react';
import { api } from '@/lib/api';
import type { Order, OrderItem } from '@/types';
import InvoiceLayout, { INR, fmtDate, fmtTime, type InvoiceData } from '@/components/InvoiceLayout';

const STATE_CODES: Record<string, string> = {
  'Andhra Pradesh': '37', 'Arunachal Pradesh': '12', 'Assam': '18',
  'Bihar': '10', 'Chhattisgarh': '22', 'Goa': '30',
  'Gujarat': '24', 'Haryana': '06', 'Himachal Pradesh': '02',
  'Jharkhand': '20', 'Karnataka': '29', 'Kerala': '32',
  'Madhya Pradesh': '23', 'Maharashtra': '27', 'Manipur': '14',
  'Meghalaya': '17', 'Mizoram': '15', 'Nagaland': '13',
  'Odisha': '21', 'Punjab': '03', 'Rajasthan': '08',
  'Sikkim': '11', 'Tamil Nadu': '33', 'Telangana': '36',
  'Tripura': '16', 'Uttar Pradesh': '09', 'Uttarakhand': '05',
  'West Bengal': '19', 'Delhi': '07',
};

const SELLER_STATE = 'Chhattisgarh';
const SELLER_STATE_CODE = '22';
const DEFAULT_GST_RATE = 5; // all prices are inclusive; fall back to 5% when category has no rate

function getProduct(item: OrderItem) {
  return typeof item.product === 'object' ? item.product : null;
}

const NIL_GST_KEYWORDS = ['seed', 'flour'];

function itemGstRate(item: OrderItem): number {
  const prod = getProduct(item);
  const category = prod && typeof prod.category === 'object' ? prod.category : null;
  if (category?.gstPercentage != null) return category.gstPercentage;
  const catName = (category?.name ?? '').toLowerCase();
  if (NIL_GST_KEYWORDS.some((kw) => catName.includes(kw))) return 0;
  return DEFAULT_GST_RATE;
}

function itemGst(item: OrderItem): number {
  const rate = itemGstRate(item);
  return item.total - item.total / (1 + rate / 100);
}

function OrderInvoiceInner() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const captureMode = searchParams.get('mode') === 'capture';
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
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      const fy = new Date(order.createdAt);
      const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
      const invoiceSlug = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)} ${order.orderNumber}`;
      const addr = order.shippingAddress ?? ({} as typeof order.shippingAddress);
      const dateStr = fmtDate(order.createdAt).replace(/\//g, '-');
      pdf.save(`${addr.name ?? 'Invoice'}_${invoiceSlug}_${dateStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!captureMode || !order || !invoiceRef.current) return;
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
        window.opener?.postMessage({ type: 'INVOICE_PDF_READY', id: orderId, base64 }, window.location.origin);
      } catch (err) {
        window.opener?.postMessage({ type: 'INVOICE_PDF_ERROR', id: orderId, error: String(err) }, window.location.origin);
      } finally {
        window.close();
      }
    }, 900);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureMode, order]);

  const G = '#1a6b3c';

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

  if (isError) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Failed to load order. Please try again.</div>;
  if (!order) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Order not found.</div>;

  const addr = order.shippingAddress ?? ({} as typeof order.shippingAddress);
  const fy = order.createdAt ? new Date(order.createdAt) : new Date();
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${order.orderNumber}`;
  const stateCode = addr.state ? (STATE_CODES[addr.state] ?? '') : '';
  const placeOfSupply = addr.state ? `${stateCode ? stateCode + '-' : ''}${addr.state}` : `${SELLER_STATE_CODE}-${SELLER_STATE}`;
  const subtotal = order.subtotal ?? 0;
  const discount = order.discount ?? 0;
  const shippingCharge = order.shippingCharge ?? 0;
  const total = order.total ?? 0;
  const isPaid = order.paymentStatus === 'paid';
  const advance = isPaid ? total : 0;
  const balance = total - advance;

  // Build tax groups using fresh GST computation (same as sales invoice)
  const taxGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  let nilTaxable = 0;
  for (const item of order.items) {
    const gstRate = itemGstRate(item);
    if (gstRate === 0) {
      nilTaxable += item.total;
    } else {
      const gstAmt = itemGst(item);
      const taxable = item.total - gstAmt;
      const half = gstAmt / 2;
      const prev = taxGroups.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
      taxGroups.set(gstRate, { taxable: prev.taxable + taxable, cgst: prev.cgst + half, sgst: prev.sgst + half });
    }
  }
  if (shippingCharge > 0) {
    const SHIP_GST = 18;
    const shipTaxable = shippingCharge / (1 + SHIP_GST / 100);
    const shipHalf = (shipTaxable * SHIP_GST) / 200;
    const prev = taxGroups.get(SHIP_GST) ?? { taxable: 0, cgst: 0, sgst: 0 };
    taxGroups.set(SHIP_GST, { taxable: prev.taxable + shipTaxable, cgst: prev.cgst + shipHalf, sgst: prev.sgst + shipHalf });
  }

  const shipTaxable = shippingCharge > 0 ? shippingCharge / 1.18 : 0;
  const shipHalf = shipTaxable * 0.09;

  const invoiceItems = [
    ...order.items.map((item) => {
      const prod = getProduct(item);
      const gstRate = itemGstRate(item);
      const gstAmt = itemGst(item);
      const taxableAmt = item.total - gstAmt;
      const pricePerUnit = item.quantity > 0 ? taxableAmt / item.quantity : 0;
      return {
        name: item.name,
        variantName: item.variantName,
        hsn: prod?.hsnCode ?? '',
        mrp: prod?.compareAtPrice ?? item.price,
        quantity: item.quantity,
        sellingPrice: item.price,
        pricePerUnit,
        taxableAmt,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        total: item.total,
        gstRate,
      };
    }),
    ...(shippingCharge > 0 ? [{
      name: 'Shipping Charge',
      hsn: '996511',
      mrp: shippingCharge,
      quantity: 1,
      sellingPrice: shippingCharge,
      pricePerUnit: shipTaxable,
      taxableAmt: shipTaxable,
      cgst: shipHalf,
      sgst: shipHalf,
      total: shippingCharge,
    }] : []),
  ];

  const data: InvoiceData = {
    docLabel: 'Sale Order',
    docNumber: order.orderNumber,
    createdAt: order.createdAt,
    orderFrom: {
      name: addr.name ?? '–',
      phone: addr.phone,
      state: placeOfSupply,
    },
    shipTo: [addr.street, addr.landmark, addr.city, addr.state, addr.pincode ? `PIN-${addr.pincode}` : ''].filter(Boolean).join(', '),
    detailRows: [
      { key: 'Order No.:', value: invoiceNo },
      { key: 'Date:', value: fmtDate(order.createdAt) },
      { key: 'Time:', value: fmtTime(order.createdAt) },
      { key: 'Place of Supply:', value: placeOfSupply },
      { key: 'Due Date:', value: fmtDate(order.createdAt), bold: true },
    ],
    items: invoiceItems,
    taxRows: [
      ...(nilTaxable > 0 ? [{ rate: 0, taxable: nilTaxable, cgst: 0, sgst: 0 }] : []),
      ...Array.from(taxGroups.entries()).sort((a, b) => b[0] - a[0]).map(([rate, { taxable, cgst, sgst }]) => ({ rate, taxable, cgst, sgst })),
    ],
    amountRows: [
      { label: 'Sub Total', val: INR(subtotal) },
      ...(shippingCharge > 0 ? [{ label: 'Shipping Charge', val: INR(shippingCharge) }] : []),
      ...(discount > 0 ? [{ label: 'Discount', val: INR(discount), negative: true }] : []),
      { label: 'Total', val: INR(total), bold: true },
      { label: 'Advance', val: INR(advance) },
      { label: 'Balance', val: INR(balance) },
    ],
    total,
  };

  return (
    <InvoiceLayout
      data={data}
      invoiceRef={invoiceRef}
      onPrint={handlePrint}
      onDownload={handleDownload}
      downloading={downloading}
    />
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f3f4f6' }}>
        <div style={{ color: '#666', fontSize: 13 }}>Loading…</div>
      </div>
    }>
      <OrderInvoiceInner />
    </Suspense>
  );
}
