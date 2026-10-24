'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect, Suspense } from 'react';
import { api } from '@/lib/api';
import type { StoreSale, SaleItem, Product } from '@/types';
import InvoiceLayout, { INR, fmtDate, fmtTime, type InvoiceData } from '@/components/InvoiceLayout';

const SELLER_STATE = 'Chhattisgarh';
const SELLER_STATE_CODE = '22';

const SALE_TYPE_LABELS: Record<string, string> = {
  walk_in: 'Walk-in', delivery: 'Delivery', website: 'Website',
};

function getProduct(item: SaleItem): Product | null {
  return typeof item.product === 'object' ? item.product as Product : null;
}

function itemGst(item: SaleItem): number {
  const prod = getProduct(item);
  const category = prod && typeof prod.category === 'object' ? prod.category : null;
  const rate = category?.gstPercentage ?? 0;
  if (!rate) return 0;
  return item.total - item.total / (1 + rate / 100);
}

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
      pdf.save(`${sale.customerName ?? 'Walk-in'}_${invoiceSlug}_${dateStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

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

  if (!sale) return <div style={{ padding: 40, color: '#dc2626', fontFamily: 'sans-serif' }}>Sale not found.</div>;

  const fy = new Date(sale.createdAt);
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${sale.saleNumber}`;
  const placeOfSupply = `${SELLER_STATE_CODE}-${SELLER_STATE}`;
  const total = sale.total ?? 0;

  const taxGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  let nilTaxable = 0;
  for (const item of sale.items) {
    const prod = getProduct(item);
    const category = prod && typeof prod.category === 'object' ? prod.category : null;
    const gstRate = category?.gstPercentage ?? 0;
    if (gstRate > 0) {
      const gstAmt = itemGst(item);
      const taxable = item.total - gstAmt;
      const half = gstAmt / 2;
      const prev = taxGroups.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
      taxGroups.set(gstRate, { taxable: prev.taxable + taxable, cgst: prev.cgst + half, sgst: prev.sgst + half });
    } else {
      nilTaxable += item.total;
    }
  }

  const data: InvoiceData = {
    docLabel: 'Sale Order',
    docNumber: sale.saleNumber,
    createdAt: sale.createdAt,
    orderFrom: {
      name: sale.customerName ?? 'Walk-in Customer',
      phone: sale.customerPhone,
      state: placeOfSupply,
    },
    shipTo: sale.customerAddress ?? sale.customerName ?? '–',
    detailRows: [
      { key: 'Order No.:', value: invoiceNo },
      { key: 'Date:', value: fmtDate(sale.createdAt) },
      { key: 'Time:', value: fmtTime(sale.createdAt) },
      { key: 'Place of Supply:', value: placeOfSupply },
      { key: 'Sale Type:', value: SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType, bold: true },
    ],
    items: sale.items.map((item: SaleItem) => {
      const prod = getProduct(item);
      const category = prod && typeof prod.category === 'object' ? prod.category : null;
      const gstRate = category?.gstPercentage ?? 0;
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
    taxRows: [
      ...(nilTaxable > 0 ? [{ rate: 0, taxable: nilTaxable, cgst: 0, sgst: 0 }] : []),
      ...Array.from(taxGroups.entries()).sort((a, b) => b[0] - a[0]).map(([rate, { taxable, cgst, sgst }]) => ({ rate, taxable, cgst, sgst })),
    ],
    amountRows: [
      { label: 'Sub Total', val: INR(total) },
      { label: 'Total', val: INR(total), bold: true },
      { label: 'Advance', val: INR(total) },
      { label: 'Balance', val: INR(0) },
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
