'use client';

import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Search, ShoppingBag, Trash2, Camera, Upload, X, Bell, Pencil, FileText, Printer, Download, Send, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { captureInvoicePdf, billFilename, base64ToBlob } from '@/lib/bill-pdf';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Store, StoreSale, SaleItem, Product } from '@/types';

const saleTypeBadge: Record<string, { label: string; className: string }> = {
  walk_in: { label: 'Walk-in', className: 'bg-blue-100 text-blue-800' },
  delivery: { label: 'Delivery', className: 'bg-purple-100 text-purple-800' },
  website: { label: 'Website', className: 'bg-green-100 text-green-800' },
};

// ─── Bill Invoice Helpers ──────────────────────────────────────────────────────

const BILL_SELLER = {
  name: 'NATURE LITE FOODS',
  legal: '(SUHIKA PVT LTD)',
  addr: 'B7, GROUND FLOOR, SECTOR-1, AVANTI VIHAR, RAIPUR-492001 (NEAR ATM CHOWK)',
  phone: '8817200740',
  email: 'naturelite2021@gmail.com',
  gstin: '22ABJCS3598L1ZR',
  state: 'Chhattisgarh',
  stateCode: '22',
};

const BILL_BANK = {
  name: 'ICICI BANK LIMITED, RAIPUR DUMARTARAI',
  account: '429705000519',
  ifsc: 'ICIC0004297',
  holder: 'SUHIKA PVT LTD',
};

const billINR = (n: number, dec = 3) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

const billDt = (d: string | Date) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

function billToWords(n: number): string {
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
  const dec2 = Math.floor((n - int) * 100);
  return (w(int).trim() || 'Zero') + ' Rupees' + (dec2 ? ' and ' + w(dec2).trim() + ' Paise' : '') + ' Only';
}

function billItemGst(item: SaleItem): number {
  const prod = typeof item.product === 'object' && item.product
    ? item.product as { gstPercentage?: number }
    : null;
  const rate = prod?.gstPercentage ?? 0;
  if (!rate) return 0;
  return item.total - item.total / (1 + rate / 100);
}

const BILL_SALE_TYPE_LABELS: Record<string, string> = {
  walk_in: 'Walk-in', delivery: 'Delivery', website: 'Website',
};

const BILL_G = '#1a6b3c';
const BILL_LG = '#e8f5ee';
const BILL_BD = '#c8c8c8';
const BILL_TH: React.CSSProperties = {
  background: BILL_G, color: '#fff', padding: '6px 4px', fontSize: 9.5,
  fontWeight: 700, border: `1px solid ${BILL_BD}`, textAlign: 'center',
};
const BILL_TD: React.CSSProperties = {
  padding: '5px 4px', fontSize: 10, border: `1px solid ${BILL_BD}`,
  verticalAlign: 'middle', textAlign: 'center',
};

function BillDialogContent({ sale }: { sale: StoreSale; storeName: string }) {
  const fy = new Date(sale.createdAt);
  const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
  const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${sale.saleNumber}`;
  const placeOfSupply = `${BILL_SELLER.stateCode}-${BILL_SELLER.state}`;
  const total = sale.total ?? 0;

  type BillProd = { gstPercentage?: number; hsnCode?: string; compareAtPrice?: number };
  const getBillProd = (item: SaleItem): BillProd | null =>
    typeof item.product === 'object' && item.product ? item.product as BillProd : null;

  const taxGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  for (const item of sale.items) {
    const prod = getBillProd(item);
    const gstRate = prod?.gstPercentage ?? 0;
    if (gstRate > 0) {
      const gstAmt = billItemGst(item);
      const taxable = item.total - gstAmt;
      const half = gstAmt / 2;
      const prev = taxGroups.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
      taxGroups.set(gstRate, { taxable: prev.taxable + taxable, cgst: prev.cgst + half, sgst: prev.sgst + half });
    }
  }
  const taxRows = Array.from(taxGroups.entries()).sort((a, b) => b[0] - a[0]);

  const amountRows: { label: string; val: string; bold?: boolean }[] = [
    { label: 'Sub Total', val: billINR(total) },
    { label: 'Total', val: billINR(total), bold: true },
    { label: 'Advance', val: billINR(total) },
    { label: 'Balance', val: billINR(0) },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1a1a1a', fontSize: 11, border: `1px solid ${BILL_BD}` }}>
      {/* Title */}
      <div style={{ textAlign: 'center', padding: '10px 0 8px', fontSize: 15, fontWeight: 700, letterSpacing: 0.5 }}>
        Sale Order
      </div>

      {/* Company Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0 16px 12px', gap: 12, borderBottom: `1px solid ${BILL_BD}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="Nature Lite Foods" style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right', fontSize: 10.5, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{BILL_SELLER.name} {BILL_SELLER.legal}</div>
          <div>{BILL_SELLER.addr}</div>
          <div>Phone no.: {BILL_SELLER.phone} Email: {BILL_SELLER.email}</div>
          <div>GSTIN: {BILL_SELLER.gstin}, State: {BILL_SELLER.stateCode}-{BILL_SELLER.state}</div>
        </div>
      </div>

      {/* Three-panel header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${BILL_BD}` }}>
        <tbody>
          <tr>
            <td style={{ width: '33%', background: BILL_G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BILL_BD}` }}>Order From</td>
            <td style={{ width: '34%', background: BILL_G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BILL_BD}` }}>Ship To</td>
            <td style={{ width: '33%', background: BILL_G, color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 8px', border: `1px solid ${BILL_BD}`, textAlign: 'right' }}>Order Details</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: `1px solid ${BILL_BD}`, verticalAlign: 'top', fontSize: 11, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600 }}>{sale.customerName ?? 'Walk-in Customer'}</div>
              {sale.customerPhone && <div>Contact No.: {sale.customerPhone}</div>}
              <div>State: {placeOfSupply}</div>
            </td>
            <td style={{ padding: '8px', border: `1px solid ${BILL_BD}`, verticalAlign: 'top', fontSize: 11, lineHeight: 1.7 }}>
              {sale.customerAddress ?? sale.customerName ?? '–'}
            </td>
            <td style={{ padding: '8px', border: `1px solid ${BILL_BD}`, verticalAlign: 'top', fontSize: 11 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {([
                    ['Order No.:', invoiceNo, false],
                    ['Date:', billDt(sale.createdAt), false],
                    ['Time:', new Date(sale.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase(), false],
                    ['Place of Supply:', placeOfSupply, false],
                    ['Sale Type:', BILL_SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType, true],
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
              <th key={h} style={{ ...BILL_TH, textAlign: i === 1 ? 'left' : 'center', whiteSpace: 'pre-line', lineHeight: 1.2 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item: SaleItem, idx: number) => {
            const prod = getBillProd(item);
            const hsn = prod?.hsnCode ?? '';
            const gstAmt = billItemGst(item);
            const taxableAmt = item.total - gstAmt;
            const pricePerUnit = item.quantity > 0 ? taxableAmt / item.quantity : 0;
            const cgst = gstAmt / 2;
            const sgst = gstAmt / 2;
            const mrp = prod?.compareAtPrice ?? item.price;
            return (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ ...BILL_TD, width: '3%' }}>{idx + 1}</td>
                <td style={{ ...BILL_TD, textAlign: 'left', width: '20%' }}>
                  {item.name}{item.variantName ? ` ${item.variantName}` : ''}
                </td>
                <td style={{ ...BILL_TD, width: '7%' }}>{hsn}</td>
                <td style={{ ...BILL_TD, width: '7%' }}>{billINR(mrp)}</td>
                <td style={{ ...BILL_TD, width: '5%' }}>{item.quantity}</td>
                <td style={{ ...BILL_TD, width: '8%' }}>₹ {billINR(pricePerUnit)}</td>
                <td style={{ ...BILL_TD, width: '9%' }}>₹ {billINR(taxableAmt)}</td>
                <td style={{ ...BILL_TD, width: '7%' }}>₹ {billINR(cgst)}</td>
                <td style={{ ...BILL_TD, width: '7%' }}>₹ {billINR(sgst)}</td>
                <td style={{ ...BILL_TD, width: '8%' }}>₹ {billINR(item.price)}</td>
                <td style={{ ...BILL_TD, width: '8%' }}>₹ {billINR(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Tax Summary | Amounts */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '55%', padding: 0, border: `1px solid ${BILL_BD}`, verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {(['Tax type', 'Taxable amount', 'Rate', 'Tax amount'] as string[]).map((h, i) => (
                      <th key={h} style={{ background: BILL_LG, color: BILL_G, padding: '5px 6px', fontSize: 10, fontWeight: 700, border: `1px solid ${BILL_BD}`, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {taxRows.length > 0 ? taxRows.flatMap(([rate, { taxable, cgst, sgst }]) => [
                    <tr key={`sgst-${rate}`}>
                      <td style={{ ...BILL_TD, textAlign: 'left' }}>SGST</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>₹ {billINR(taxable)}</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>{(rate / 2).toFixed(1)}%</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>₹ {billINR(sgst)}</td>
                    </tr>,
                    <tr key={`cgst-${rate}`}>
                      <td style={{ ...BILL_TD, textAlign: 'left' }}>CGST</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>₹ {billINR(taxable)}</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>{(rate / 2).toFixed(1)}%</td>
                      <td style={{ ...BILL_TD, textAlign: 'right' }}>₹ {billINR(cgst)}</td>
                    </tr>,
                  ]) : (
                    <tr>
                      <td colSpan={4} style={{ ...BILL_TD, fontStyle: 'italic', color: '#888' }}>No GST applicable</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </td>
            <td style={{ width: '45%', padding: 0, border: `1px solid ${BILL_BD}`, verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ background: BILL_LG, color: BILL_G, padding: '5px 8px', fontSize: 10, fontWeight: 700, border: `1px solid ${BILL_BD}`, textAlign: 'left' }}>Amounts</th>
                  </tr>
                </thead>
                <tbody>
                  {amountRows.map(({ label, val, bold }) => (
                    <tr key={label}>
                      <td style={{ ...BILL_TD, textAlign: 'left', fontWeight: bold ? 700 : 400 }}>{label}</td>
                      <td style={{ ...BILL_TD, textAlign: 'right', fontWeight: bold ? 700 : 400 }}>₹ {val}</td>
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
            <th style={{ background: BILL_G, color: '#fff', padding: '5px 8px', fontSize: 10, fontWeight: 700, border: `1px solid ${BILL_BD}`, textAlign: 'center' }}>
              Order Amount In Words
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '6px 10px', fontSize: 11, border: `1px solid ${BILL_BD}`, textAlign: 'center' }}>
              {billToWords(total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bank Details | Terms */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', padding: 0, border: `1px solid ${BILL_BD}`, verticalAlign: 'top' }}>
              <div style={{ background: BILL_G, color: '#fff', fontWeight: 700, fontSize: 10, padding: '5px 8px' }}>Bank Details</div>
              <div style={{ padding: '8px 10px', fontSize: 10.5, lineHeight: 1.8 }}>
                <div><strong>Name:</strong> {BILL_BANK.name}</div>
                <div><strong>Account No.:</strong> {BILL_BANK.account}</div>
                <div><strong>IFSC code:</strong> {BILL_BANK.ifsc}</div>
                <div><strong>Account Holder&apos;s Name:</strong> {BILL_BANK.holder}</div>
              </div>
            </td>
            <td style={{ width: '50%', padding: 0, border: `1px solid ${BILL_BD}`, verticalAlign: 'top' }}>
              <div style={{ background: BILL_G, color: '#fff', fontWeight: 700, fontSize: 10, padding: '5px 8px' }}>Terms and conditions</div>
              <div style={{ padding: '8px 10px', fontSize: 10.5 }}>Thanks for doing business with us!</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface CartLineItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variantSku?: string;
  maxStock?: number;
}

export default function SalesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAdminAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [saleTypeFilter, setSaleTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showLogSale, setShowLogSale] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingSaleStoreId, setEditingSaleStoreId] = useState<string | null>(null);
  const [viewingBillSale, setViewingBillSale] = useState<StoreSale | null>(null);

  // Log sale form state
  const [saleType, setSaleType] = useState<'walk_in' | 'delivery'>('walk_in');
  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [upiProofUrl, setUpiProofUrl] = useState<string | null>(null);
  const [upiProofUploading, setUpiProofUploading] = useState(false);
  const [logSaleStoreId, setLogSaleStoreId] = useState<string>('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderDueAt, setReminderDueAt] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('Maharashtra');
  const [addrPincode, setAddrPincode] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit sale form state
  const [editSaleType, setEditSaleType] = useState<'walk_in' | 'delivery' | 'website'>('walk_in');
  const [editCartItems, setEditCartItems] = useState<CartLineItem[]>([]);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editPaymentMethod, setEditPaymentMethod] = useState('cash');
  const [editPaymentProofUrl, setEditPaymentProofUrl] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editProductSearch, setEditProductSearch] = useState('');
  const debouncedEditProductSearch = useDebouncedValue(editProductSearch, 300);
  const [editProductDropdownOpen, setEditProductDropdownOpen] = useState(false);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editProofUploading, setEditProofUploading] = useState(false);
  const editProofFileRef = useRef<HTMLInputElement>(null);
  const editProofCameraRef = useRef<HTMLInputElement>(null);
  const editImagesFileRef = useRef<HTMLInputElement>(null);

  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const effectiveLogSaleStore = (isSuperadmin ? logSaleStoreId : user?.storeId ?? selectedStoreId) || selectedStoreId;

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
  });

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0 && isSuperadmin) {
      setSelectedStoreId(stores[0]._id);
    }
  }, [stores, selectedStoreId, isSuperadmin]);

  useEffect(() => {
    if (showLogSale) {
      setLogSaleStoreId(isSuperadmin ? selectedStoreId : (user?.storeId || selectedStoreId));
    }
  }, [showLogSale, isSuperadmin, selectedStoreId, user?.storeId]);

  const { data: editingSale } = useQuery({
    queryKey: ['sale', editingSaleId, editingSaleStoreId],
    queryFn: () => api.getSaleById(editingSaleId!, editingSaleStoreId ?? undefined),
    enabled: !!editingSaleId && !!editingSaleStoreId,
  });

  useEffect(() => {
    if (editingSale) {
      setEditSaleType(editingSale.saleType as 'walk_in' | 'delivery' | 'website');
      setEditCustomerName(editingSale.customerName || '');
      setEditCustomerPhone(editingSale.customerPhone || '');
      setEditCustomerAddress(editingSale.customerAddress || '');
      setEditDiscount(String(editingSale.discount ?? 0));
      setEditPaymentMethod(editingSale.paymentMethod || 'cash');
      setEditPaymentProofUrl(editingSale.paymentProofUrl || null);
      setEditNotes(editingSale.notes || '');
      setEditImages(editingSale.images || []);
      const items = (editingSale.items || []).map((it: SaleItem) => {
        const productId = typeof it.product === 'object' && it.product
          ? (it.product._id?.toString?.() ?? it.product._id)
          : (it.product ?? '');
        const name = it.variantName ? `${it.name} – ${it.variantName}` : it.name;
        return {
          productId: String(productId || ''),
          name,
          price: it.price,
          quantity: it.quantity,
          variantSku: it.variantSku,
          maxStock: 999,
        };
      });
      setEditCartItems(items.filter((i: CartLineItem) => i.productId));
    }
  }, [editingSale]);

  const { data: salesData, isLoading } = useQuery({
    queryKey: ['store-sales', selectedStoreId, page, debouncedSearch, saleTypeFilter],
    queryFn: () =>
      api.getStoreSales(selectedStoreId, {
        page,
        limit: 20,
        search: debouncedSearch,
        saleType: saleTypeFilter || undefined,
      }),
    enabled: !!selectedStoreId,
  });

  const { data: allProductsData } = useQuery({
    queryKey: ['products-for-sale', debouncedProductSearch],
    queryFn: () =>
      api.getProducts({
        search: debouncedProductSearch || undefined,
        isActive: true,
        limit: 50,
        page: 1,
      }),
    enabled: showLogSale,
  });
  const rawProducts = (allProductsData?.items ?? []) as Product[];

  type AddableRow = {
    productId: string;
    productName: string;
    productSku?: string;
    variantSku?: string;
    variantName?: string;
    price: number;
    stock: number;
  };
  const addableRows: AddableRow[] = [];
  rawProducts.forEach((product: Product) => {
    const hasVariants = product.variants && product.variants.length > 0;
    if (hasVariants) {
      product.variants.filter((v) => v.isActive).forEach((variant) => {
        addableRows.push({
          productId: product._id,
          productName: product.name,
          productSku: product.sku,
          variantSku: variant.sku,
          variantName: variant.name,
          price: variant.price,
          stock: variant.stock,
        });
      });
    } else {
      addableRows.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        variantSku: undefined,
        variantName: undefined,
        price: product.price,
        stock: product.stock,
      });
    }
  });
  const productResults = addableRows;

  const editStoreId = editingSaleStoreId || (editingSale
    ? (typeof editingSale.store === 'object' ? (editingSale.store as { _id: string })._id : editingSale.store)
    : selectedStoreId);

  const { data: editAllProductsData } = useQuery({
    queryKey: ['products-for-sale', debouncedEditProductSearch],
    queryFn: () =>
      api.getProducts({
        search: debouncedEditProductSearch || undefined,
        isActive: true,
        limit: 50,
        page: 1,
      }),
    enabled: !!editingSaleId,
  });
  const editRawProducts = (editAllProductsData?.items ?? []) as Product[];
  type EditAddableRow = {
    productId: string;
    productName: string;
    productSku?: string;
    variantSku?: string;
    variantName?: string;
    price: number;
    stock: number;
  };
  const editAddableRows: EditAddableRow[] = [];
  editRawProducts.forEach((product: Product) => {
    const hasVariants = product.variants && product.variants.length > 0;
    if (hasVariants) {
      product.variants.filter((v) => v.isActive).forEach((variant) => {
        editAddableRows.push({
          productId: product._id,
          productName: product.name,
          productSku: product.sku,
          variantSku: variant.sku,
          variantName: variant.name,
          price: variant.price,
          stock: variant.stock,
        });
      });
    } else {
      editAddableRows.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        variantSku: undefined,
        variantName: undefined,
        price: product.price,
        stock: product.stock,
      });
    }
  });

  const logSaleMutation = useMutation({
    mutationFn: () =>
      api.logSale({
        storeId: effectiveLogSaleStore,
        saleType,
        items: cartItems.map((item) => ({
          productId: item.productId,
          variantSku: item.variantSku,
          quantity: item.quantity,
        })),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: saleType === 'delivery'
          ? [addrStreet, addrLandmark, addrCity, addrState, addrPincode ? `PIN-${addrPincode}` : ''].filter(Boolean).join(', ') || undefined
          : customerAddress || undefined,
        discount: parseFloat(discount) || 0,
        paymentMethod,
        paymentProofUrl: paymentMethod === 'upi' ? upiProofUrl || undefined : undefined,
        notes: notes || undefined,
        reminderMessage: reminderMessage || undefined,
        reminderDueAt: reminderMessage && reminderDueAt ? reminderDueAt : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-sales'] });
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
      resetForm();
      setShowLogSale(false);
    },
  });

  const updateSaleMutation = useMutation({
    mutationFn: () => {
      if (!editingSaleId || !editStoreId) throw new Error('Missing sale or store');
      return api.updateSale(editingSaleId, {
        storeId: editStoreId,
        saleType: editSaleType,
        items: editCartItems.map((i) => ({
          productId: i.productId,
          variantSku: i.variantSku,
          quantity: i.quantity,
        })),
        customerName: editCustomerName || undefined,
        customerPhone: editCustomerPhone || undefined,
        customerAddress: editCustomerAddress || undefined,
        discount: parseFloat(editDiscount) || 0,
        paymentMethod: editPaymentMethod,
        paymentProofUrl: editPaymentMethod === 'upi' ? editPaymentProofUrl || undefined : undefined,
        images: editImages,
        notes: editNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-sales'] });
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      queryClient.invalidateQueries({ queryKey: ['sale', editingSaleId] });
      setEditingSaleId(null);
      setEditingSaleStoreId(null);
    },
  });

  const addToEditCart = (row: EditAddableRow) => {
    const name = row.variantName ? `${row.productName} – ${row.variantName}` : row.productName;
    const existing = editCartItems.find(
      (i) => i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? ''),
    );
    if (existing) {
      setEditCartItems(
        editCartItems.map((i) =>
          i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? '')
            ? { ...i, quantity: Math.min(i.quantity + 1, row.stock), maxStock: row.stock }
            : i,
        ),
      );
    } else {
      setEditCartItems([
        ...editCartItems,
        {
          productId: row.productId,
          name,
          price: row.price,
          quantity: 1,
          maxStock: row.stock,
          variantSku: row.variantSku,
        },
      ]);
    }
    setEditProductSearch('');
  };

  function getSaleInvoiceUrl(sale: StoreSale): string {
    const sid = typeof sale.store === 'object' ? (sale.store as { _id: string })._id : sale.store;
    return `/invoice/sale/${sale._id}?storeId=${sid}`;
  }

  async function handleDownloadBill(sale: StoreSale) {
    setBillLoadingId(sale._id);
    try {
      const b64 = await captureInvoicePdf(getSaleInvoiceUrl(sale), sale._id);
      const blob = base64ToBlob(b64);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = billFilename(sale.saleNumber);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Failed to generate PDF', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBillLoadingId(null);
    }
  }

  async function handleSendBill(sale: StoreSale) {
    if (!sale.customerPhone) {
      toast({ title: 'Cannot send', description: 'No customer phone number on this sale.', variant: 'destructive' });
      return;
    }
    setSendLoadingId(sale._id);
    try {
      const b64 = await captureInvoicePdf(getSaleInvoiceUrl(sale), sale._id);
      await api.uploadSaleInvoice(sale._id, b64, billFilename(sale.saleNumber));
      await api.sendSaleInvoice(sale._id);
      queryClient.invalidateQueries({ queryKey: ['store-sales'] });
      toast({ title: 'Invoice sent!', description: `Bill for ${sale.saleNumber} sent to customer via WhatsApp.` });
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : 'Please try again.');
      toast({ title: 'Failed to send invoice', description: msg, variant: 'destructive' });
    } finally {
      setSendLoadingId(null);
    }
  }

  const resetForm = () => {
    setSaleType('walk_in');
    setCartItems([]);
    setProductSearch('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setDiscount('0');
    setPaymentMethod('cash');
    setNotes('');
    setUpiProofUrl(null);
    setReminderMessage('');
    setReminderDueAt('');
    setAddrStreet('');
    setAddrLandmark('');
    setAddrCity('');
    setAddrState('Maharashtra');
    setAddrPincode('');
  };

  const handleUpiProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setUpiProofUploading(true);
    try {
      const result = await api.uploadImage(file, 'sales');
      setUpiProofUrl(result.url);
    } catch {
      setUpiProofUrl(null);
    } finally {
      setUpiProofUploading(false);
    }
  };

  const addToCart = (row: AddableRow) => {
    const name = row.variantName
      ? `${row.productName} – ${row.variantName}`
      : row.productName;
    const existing = cartItems.find(
      (i) => i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? ''),
    );
    if (existing) {
      setCartItems(
        cartItems.map((i) =>
          i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? '')
            ? { ...i, quantity: Math.min(i.quantity + 1, row.stock), maxStock: row.stock }
            : i,
        ),
      );
    } else {
      setCartItems([
        ...cartItems,
        {
          productId: row.productId,
          name,
          price: row.price,
          quantity: 1,
          maxStock: row.stock,
          variantSku: row.variantSku,
        },
      ]);
    }
    setProductSearch('');
  };

  const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal - (parseFloat(discount) || 0));

  const storeNameForBill = (sale: StoreSale) => {
    const s = sale.store;
    if (typeof s === 'object' && s?.name) return (s as Store).name;
    const store = stores.find((st) => st._id === (typeof s === 'string' ? s : (s as { _id: string })._id));
    return store?.name ?? 'Store';
  };

  const printBill = (sale: StoreSale) => {
    const fy = new Date(sale.createdAt);
    const fyStart = fy.getMonth() >= 3 ? fy.getFullYear() : fy.getFullYear() - 1;
    const invoiceNo = `NLF-${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${sale.saleNumber}`;
    const placeOfSupply = `${BILL_SELLER.stateCode}-${BILL_SELLER.state}`;
    const total = sale.total ?? 0;
    const logoUrl = window.location.origin + '/images/logo.png';

    type PrintProd = { gstPercentage?: number; hsnCode?: string; compareAtPrice?: number };
    const getPrintProd = (item: SaleItem): PrintProd | null =>
      typeof item.product === 'object' && item.product ? item.product as PrintProd : null;

    const taxGroups = new Map<number, { taxable: number; cgst: number; sgst: number }>();
    for (const item of sale.items) {
      const prod = getPrintProd(item);
      const gstRate = prod?.gstPercentage ?? 0;
      if (gstRate > 0) {
        const gstAmt = billItemGst(item);
        const taxable = item.total - gstAmt;
        const half = gstAmt / 2;
        const prev = taxGroups.get(gstRate) ?? { taxable: 0, cgst: 0, sgst: 0 };
        taxGroups.set(gstRate, { taxable: prev.taxable + taxable, cgst: prev.cgst + half, sgst: prev.sgst + half });
      }
    }
    const taxRows = Array.from(taxGroups.entries()).sort((a, b) => b[0] - a[0]);

    const th = `background:#1a6b3c;color:#fff;padding:6px 4px;font-size:9.5px;font-weight:700;border:1px solid #c8c8c8;text-align:center`;
    const td = `padding:5px 4px;font-size:10px;border:1px solid #c8c8c8;vertical-align:middle;text-align:center`;

    const itemsHtml = sale.items.map((it: SaleItem, idx: number) => {
      const prod = getPrintProd(it);
      const hsn = prod?.hsnCode ?? '';
      const gstAmt = billItemGst(it);
      const taxableAmt = it.total - gstAmt;
      const pricePerUnit = it.quantity > 0 ? taxableAmt / it.quantity : 0;
      const cgst = gstAmt / 2;
      const sgst = gstAmt / 2;
      const mrp = prod?.compareAtPrice ?? it.price;
      const bg = idx % 2 === 0 ? '#fff' : '#f9fafb';
      return `<tr style="background:${bg}">
        <td style="${td};width:3%">${idx + 1}</td>
        <td style="${td};text-align:left;width:20%">${it.name}${it.variantName ? ` ${it.variantName}` : ''}</td>
        <td style="${td};width:7%">${hsn}</td>
        <td style="${td};width:7%">${billINR(mrp)}</td>
        <td style="${td};width:5%">${it.quantity}</td>
        <td style="${td};width:8%">&#8377; ${billINR(pricePerUnit)}</td>
        <td style="${td};width:9%">&#8377; ${billINR(taxableAmt)}</td>
        <td style="${td};width:7%">&#8377; ${billINR(cgst)}</td>
        <td style="${td};width:7%">&#8377; ${billINR(sgst)}</td>
        <td style="${td};width:8%">&#8377; ${billINR(it.price)}</td>
        <td style="${td};width:8%">&#8377; ${billINR(it.total)}</td>
      </tr>`;
    }).join('');

    const taxRowsHtml = taxRows.length > 0
      ? taxRows.flatMap(([rate, { taxable, cgst, sgst }]) => [
        `<tr><td style="${td};text-align:left">SGST</td><td style="${td};text-align:right">&#8377; ${billINR(taxable)}</td><td style="${td};text-align:right">${(rate / 2).toFixed(1)}%</td><td style="${td};text-align:right">&#8377; ${billINR(sgst)}</td></tr>`,
        `<tr><td style="${td};text-align:left">CGST</td><td style="${td};text-align:right">&#8377; ${billINR(taxable)}</td><td style="${td};text-align:right">${(rate / 2).toFixed(1)}%</td><td style="${td};text-align:right">&#8377; ${billINR(cgst)}</td></tr>`,
      ]).join('')
      : `<tr><td colspan="4" style="${td};font-style:italic;color:#888">No GST applicable</td></tr>`;

    const fmtDateStr = billDt(sale.createdAt);
    const fmtTimeStr = new Date(sale.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
    const saleTypeLabel = BILL_SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sale Order - ${sale.saleNumber}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;color:#1a1a1a;font-size:11px}
@media print{body{background:white}.np{display:none!important}.inv{box-shadow:none!important;margin:0!important;max-width:100%!important;border-radius:0!important}@page{size:A4 portrait;margin:6mm 8mm}}</style></head>
<body>
<div class="np" style="position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 4px rgba(0,0,0,.06)">
  <div style="font-weight:700;color:#1a6b3c;font-size:14px">Sale Order &#8212; ${sale.saleNumber}</div>
  <div style="display:flex;gap:8px">
    <button onclick="window.print()" style="background:#e8f5ee;color:#1a6b3c;border:1px solid #c8c8c8;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer">Print</button>
    <button onclick="window.close()" style="background:#fff;color:#666;border:1px solid #e5e7eb;border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer">&#10005;</button>
  </div>
</div>
<div style="padding:24px 16px 40px">
<div class="inv" style="max-width:800px;margin:0 auto;background:#fff;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,.10);font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:11px;border:1px solid #c8c8c8">

  <div style="text-align:center;padding:10px 0 8px;font-size:15px;font-weight:700;letter-spacing:.5px">Sale Order</div>

  <div style="display:flex;align-items:flex-start;padding:0 16px 12px;gap:12px;border-bottom:1px solid #c8c8c8">
    <img src="${logoUrl}" alt="Nature Lite Foods" style="width:72px;height:72px;object-fit:contain;flex-shrink:0">
    <div style="flex:1"></div>
    <div style="text-align:right;font-size:10.5px;line-height:1.6">
      <div style="font-weight:800;font-size:13px">${BILL_SELLER.name} ${BILL_SELLER.legal}</div>
      <div>${BILL_SELLER.addr}</div>
      <div>Phone no.: ${BILL_SELLER.phone} Email: ${BILL_SELLER.email}</div>
      <div>GSTIN: ${BILL_SELLER.gstin}, State: ${BILL_SELLER.stateCode}-${BILL_SELLER.state}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;border-top:1px solid #c8c8c8">
    <tr>
      <td style="width:33%;background:#1a6b3c;color:#fff;font-weight:700;font-size:11px;padding:5px 8px;border:1px solid #c8c8c8">Order From</td>
      <td style="width:34%;background:#1a6b3c;color:#fff;font-weight:700;font-size:11px;padding:5px 8px;border:1px solid #c8c8c8">Ship To</td>
      <td style="width:33%;background:#1a6b3c;color:#fff;font-weight:700;font-size:11px;padding:5px 8px;border:1px solid #c8c8c8;text-align:right">Order Details</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #c8c8c8;vertical-align:top;font-size:11px;line-height:1.7">
        <div style="font-weight:600">${sale.customerName ?? 'Walk-in Customer'}</div>
        ${sale.customerPhone ? `<div>Contact No.: ${sale.customerPhone}</div>` : ''}
        <div>State: ${placeOfSupply}</div>
      </td>
      <td style="padding:8px;border:1px solid #c8c8c8;vertical-align:top;font-size:11px;line-height:1.7">
        ${sale.customerAddress ?? sale.customerName ?? '&#8211;'}
      </td>
      <td style="padding:8px;border:1px solid #c8c8c8;vertical-align:top;font-size:11px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#555;padding:1px 4px 1px 0;white-space:nowrap;font-size:10.5px">Order No.:</td><td style="text-align:right;font-size:10.5px">${invoiceNo}</td></tr>
          <tr><td style="color:#555;padding:1px 4px 1px 0;white-space:nowrap;font-size:10.5px">Date:</td><td style="text-align:right;font-size:10.5px">${fmtDateStr}</td></tr>
          <tr><td style="color:#555;padding:1px 4px 1px 0;white-space:nowrap;font-size:10.5px">Time:</td><td style="text-align:right;font-size:10.5px">${fmtTimeStr}</td></tr>
          <tr><td style="color:#555;padding:1px 4px 1px 0;white-space:nowrap;font-size:10.5px">Place of Supply:</td><td style="text-align:right;font-size:10.5px">${placeOfSupply}</td></tr>
          <tr><td style="color:#555;padding:1px 4px 1px 0;white-space:nowrap;font-size:10.5px">Sale Type:</td><td style="text-align:right;font-weight:700;font-size:10.5px">${saleTypeLabel}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="${th};text-align:center">#</th>
      <th style="${th};text-align:left">Item name</th>
      <th style="${th}">HSN/SAC</th>
      <th style="${th}">MRP</th>
      <th style="${th}">Quantity</th>
      <th style="${th}">Price/Unit</th>
      <th style="${th}">Taxable amount</th>
      <th style="${th}">CGST</th>
      <th style="${th}">SGST</th>
      <th style="${th}">Final Rate</th>
      <th style="${th}">Amount</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="width:55%;padding:0;border:1px solid #c8c8c8;vertical-align:top">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="background:#e8f5ee;color:#1a6b3c;padding:5px 6px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:left">Tax type</th>
            <th style="background:#e8f5ee;color:#1a6b3c;padding:5px 6px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:right">Taxable amount</th>
            <th style="background:#e8f5ee;color:#1a6b3c;padding:5px 6px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:right">Rate</th>
            <th style="background:#e8f5ee;color:#1a6b3c;padding:5px 6px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:right">Tax amount</th>
          </tr></thead>
          <tbody>${taxRowsHtml}</tbody>
        </table>
      </td>
      <td style="width:45%;padding:0;border:1px solid #c8c8c8;vertical-align:top">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th colspan="2" style="background:#e8f5ee;color:#1a6b3c;padding:5px 8px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:left">Amounts</th></tr></thead>
          <tbody>
            <tr><td style="${td};text-align:left">Sub Total</td><td style="${td};text-align:right">&#8377; ${billINR(total)}</td></tr>
            <tr><td style="${td};text-align:left;font-weight:700">Total</td><td style="${td};text-align:right;font-weight:700">&#8377; ${billINR(total)}</td></tr>
            <tr><td style="${td};text-align:left">Advance</td><td style="${td};text-align:right">&#8377; ${billINR(total)}</td></tr>
            <tr><td style="${td};text-align:left">Balance</td><td style="${td};text-align:right">&#8377; ${billINR(0)}</td></tr>
          </tbody>
        </table>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead><tr><th style="background:#1a6b3c;color:#fff;padding:5px 8px;font-size:10px;font-weight:700;border:1px solid #c8c8c8;text-align:center">Order Amount In Words</th></tr></thead>
    <tbody><tr><td style="padding:6px 10px;font-size:11px;border:1px solid #c8c8c8;text-align:center">${billToWords(total)}</td></tr></tbody>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="width:50%;padding:0;border:1px solid #c8c8c8;vertical-align:top">
        <div style="background:#1a6b3c;color:#fff;font-weight:700;font-size:10px;padding:5px 8px">Bank Details</div>
        <div style="padding:8px 10px;font-size:10.5px;line-height:1.8">
          <div><strong>Name:</strong> ${BILL_BANK.name}</div>
          <div><strong>Account No.:</strong> ${BILL_BANK.account}</div>
          <div><strong>IFSC code:</strong> ${BILL_BANK.ifsc}</div>
          <div><strong>Account Holder's Name:</strong> ${BILL_BANK.holder}</div>
        </div>
      </td>
      <td style="width:50%;padding:0;border:1px solid #c8c8c8;vertical-align:top">
        <div style="background:#1a6b3c;color:#fff;font-weight:700;font-size:10px;padding:5px 8px">Terms and conditions</div>
        <div style="padding:8px 10px;font-size:10.5px">Thanks for doing business with us!</div>
      </td>
    </tr>
  </table>

</div></div></body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 300);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sales Log</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1">Track walk-in, delivery, and website sales</p>
        </div>
        <Button onClick={() => setShowLogSale(true)} disabled={!selectedStoreId} className="shrink-0 w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Log Sale
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:pt-6 sm:px-6 sm:pb-6">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end">
            {isSuperadmin && (
              <div className="w-full sm:w-48">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Store</label>
                <Select value={selectedStoreId} onValueChange={(v) => { setSelectedStoreId(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.filter((s) => s._id).map((store) => (
                      <SelectItem key={store._id} value={store._id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by sale number or customer..."
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full sm:w-40">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Sale Type</label>
              <Select value={saleTypeFilter || 'all'} onValueChange={(v) => { setSaleTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales - Mobile cards */}
      <div className="md:hidden space-y-3">
        {salesData?.items?.map((sale: StoreSale) => {
          const badge = saleTypeBadge[sale.saleType] || saleTypeBadge.walk_in;
          return (
            <Card key={sale._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-tight">{sale.customerName || 'Walk-in Customer'}</p>
                    {sale.customerAddress && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-tight line-clamp-2">{sale.customerAddress}</p>
                    )}
                    {sale.customerPhone && <p className="text-xs text-gray-400 mt-0.5">{sale.customerPhone}</p>}
                    <p className="text-[10px] text-gray-400/70 mt-0.5 font-mono">{sale.saleNumber} · {new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <Badge variant="secondary" className={badge.className + ' shrink-0'}>
                    {badge.label}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {sale.items?.length
                    ? sale.items.map((it: { name: string; quantity: number }) => `${it.name} × ${it.quantity}`).join(', ')
                    : '—'}
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="font-bold">₹{sale.total.toLocaleString()}</span>
                  <span className="text-xs text-gray-500 capitalize">{sale.paymentMethod}</span>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewingBillSale(sale)}>
                    <FileText className="h-4 w-4 mr-1" />
                    Bill
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={billLoadingId === sale._id}
                    onClick={() => handleDownloadBill(sale)}
                  >
                    {billLoadingId === sale._id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={sendLoadingId === sale._id || !sale.customerPhone}
                    title={sale.customerPhone ? 'Send bill via WhatsApp' : 'No phone'}
                    onClick={() => handleSendBill(sale)}
                  >
                    {sendLoadingId === sale._id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    Send
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const sid = typeof sale.store === 'object' ? (sale.store as { _id: string })._id : sale.store;
                      window.open(`/invoice/sale/${sale._id}?storeId=${sid}`, '_blank');
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    GST
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const sid = typeof sale.store === 'object' ? (sale.store as { _id: string })._id : sale.store;
                      setEditingSaleId(sale._id);
                      setEditingSaleStoreId(sid);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!salesData?.items || salesData.items.length === 0) && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p>No sales found</p>
            </CardContent>
          </Card>
        )}
        {salesData && salesData.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">Page {salesData.page} of {salesData.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!salesData.hasPrevious} onClick={() => setPage(page - 1)}>
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={!salesData.hasNext} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sales Table - Desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Customer</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Items</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Total</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Payment</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salesData?.items?.map((sale: StoreSale) => {
                  const badge = saleTypeBadge[sale.saleType] || saleTypeBadge.walk_in;
                  return (
                    <tr key={sale._id} className="border-b hover:bg-gray-50/50">
                      <td className="p-4 text-sm">
                        <div>
                          <p className="font-medium leading-tight">{sale.customerName || 'Walk-in Customer'}</p>
                          {sale.customerAddress && (
                            <p className="text-xs text-gray-500 mt-0.5 leading-tight max-w-[220px]" title={sale.customerAddress}>
                              {sale.customerAddress}
                            </p>
                          )}
                          {sale.customerPhone && (
                            <p className="text-xs text-gray-400 mt-0.5">{sale.customerPhone}</p>
                          )}
                          <p className="text-[10px] text-gray-400/70 mt-0.5 font-mono">{sale.saleNumber}</p>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-gray-600 max-w-xs">
                        {sale.items?.length
                          ? sale.items.map((it: { name: string; quantity: number }) => `${it.name} × ${it.quantity}`).join(', ')
                          : '—'}
                      </td>
                      <td className="p-4 text-sm font-bold">₹{sale.total.toLocaleString()}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 capitalize">{sale.paymentMethod}</span>
                          {sale.paymentProofUrl && (
                            <a
                              href={sale.paymentProofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex"
                              title="View payment proof"
                            >
                              <img
                                src={sale.paymentProofUrl}
                                alt="Payment proof"
                                className="h-8 w-8 rounded border object-cover hover:ring-2 hover:ring-primary"
                              />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingBillSale(sale)}
                            title="View bill"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Download bill PDF"
                            disabled={billLoadingId === sale._id}
                            onClick={() => handleDownloadBill(sale)}
                          >
                            {billLoadingId === sale._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={sale.customerPhone ? 'Send bill to customer via WhatsApp' : 'No phone — cannot send'}
                            disabled={sendLoadingId === sale._id || !sale.customerPhone}
                            onClick={() => handleSendBill(sale)}
                          >
                            {sendLoadingId === sale._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const sid = typeof sale.store === 'object' ? (sale.store as { _id: string })._id : sale.store;
                              window.open(`/invoice/sale/${sale._id}?storeId=${sid}`, '_blank');
                            }}
                            title="Generate GST Invoice"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const sid = typeof sale.store === 'object' ? (sale.store as { _id: string })._id : sale.store;
                              setEditingSaleId(sale._id);
                              setEditingSaleStoreId(sid);
                            }}
                            title="Edit sale"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!salesData?.items || salesData.items.length === 0) && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p>No sales found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {salesData && salesData.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-500">
                Page {salesData.page} of {salesData.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!salesData.hasPrevious} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={!salesData.hasNext} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Sale Dialog */}
      <Dialog open={showLogSale} onOpenChange={(open) => { if (!open) resetForm(); setShowLogSale(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log a Sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isSuperadmin && (
              <div>
                <label className="text-sm font-medium">Store</label>
                <p className="text-xs text-muted-foreground mb-2">Select which store this sale is for</p>
                <Select
                  value={logSaleStoreId}
                  onValueChange={(v) => {
                    setLogSaleStoreId(v);
                    setCartItems([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.filter((s) => s._id).map((store) => (
                      <SelectItem key={store._id} value={store._id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Sale Type</label>
                <Select value={saleType} onValueChange={(v: 'walk_in' | 'delivery') => setSaleType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Payment Method</label>
                <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== 'upi') setUpiProofUrl(null); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* UPI payment proof – camera or upload */}
            {paymentMethod === 'upi' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">UPI payment proof (optional)</label>
                <p className="text-xs text-muted-foreground">Take a photo of the payment screen or upload a screenshot</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleUpiProofFile}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUpiProofFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={upiProofUploading}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {upiProofUploading ? 'Uploading...' : 'Take photo'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={upiProofUploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {upiProofUploading ? 'Uploading...' : 'Upload image'}
                  </Button>
                </div>
                {upiProofUrl && (
                  <div className="relative inline-block mt-2">
                    <img src={upiProofUrl} alt="Payment proof" className="h-24 w-auto rounded-lg border object-cover" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-muted"
                      onClick={() => setUpiProofUrl(null)}
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Product dropdown – only in-stock products */}
            <div>
              <label className="text-sm font-medium">Add Products</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onFocus={() => setProductDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
                  placeholder="Select or search products..."
                  className="pl-10"
                  readOnly={false}
                />
              </div>
              {productDropdownOpen && (
                <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-white shadow-lg z-10">
                  {productResults.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No products found.
                    </p>
                  ) : (
                    productResults.map((row: AddableRow) => (
                      <button
                        key={`${row.productId}-${row.variantSku ?? 'main'}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addToCart(row);
                          setProductSearch('');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 text-sm text-left border-b last:border-b-0"
                      >
                        <span>
                          {row.productName}
                          {row.variantName ? ` · ${row.variantName}` : ''}
                          {row.variantSku ? ` (${row.variantSku})` : row.productSku ? ` (${row.productSku})` : ''}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          ₹{row.price.toLocaleString()} · {row.stock} in stock
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Cart Items */}
            {cartItems.length > 0 && (
              <div className="border rounded-lg divide-y">
                {cartItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">₹{item.price} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={item.maxStock ?? 999}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          const cap = item.maxStock ?? 999;
                          setCartItems(
                            cartItems.map((ci, i) =>
                              i === idx ? { ...ci, quantity: Math.min(Math.max(1, val), cap) } : ci,
                            ),
                          );
                        }}
                        className="w-16 h-8 text-center"
                      />
                      <span className="text-sm font-medium w-20 text-right">
                        ₹{(item.price * item.quantity).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCartItems(cartItems.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Customer Info */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Customer Name <span className="text-muted-foreground font-normal">(Optional)</span></label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Customer Phone <span className="text-muted-foreground font-normal">(Optional)</span></label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {saleType === 'delivery' ? (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <label className="text-sm font-medium block">
                    Delivery Address <span className="text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Street / House No.</label>
                      <Input
                        value={addrStreet}
                        onChange={(e) => setAddrStreet(e.target.value)}
                        placeholder="e.g. 12, Nehru Nagar, Near Bus Stand"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Landmark</label>
                      <Input
                        value={addrLandmark}
                        onChange={(e) => setAddrLandmark(e.target.value)}
                        placeholder="e.g. Near temple"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">City</label>
                      <Input
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                        placeholder="e.g. Hinganghat"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">State</label>
                      <Input
                        value={addrState}
                        onChange={(e) => setAddrState(e.target.value)}
                        placeholder="e.g. Maharashtra"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Pincode</label>
                      <Input
                        value={addrPincode}
                        onChange={(e) => setAddrPincode(e.target.value)}
                        placeholder="e.g. 442301"
                        maxLength={6}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium">Customer Address <span className="text-muted-foreground font-normal">(Optional)</span></label>
                  <Textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Street, city, pincode..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Discount</label>
                <Input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes..."
                />
              </div>
            </div>

            {/* Reminder (optional) – shows on dashboard 1hr before due time */}
            <div className="space-y-2 border-t pt-4">
              <label className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Set Reminder (optional)
              </label>
              <p className="text-xs text-muted-foreground">e.g. &quot;This order should be delivered by 3 p.m.&quot; — Shows on dashboard when due within 24 hours.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="e.g. Deliver by 3 p.m."
                  className="sm:col-span-2"
                />
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Due date & time</label>
                  <Input
                    type="datetime-local"
                    value={reminderDueAt}
                    onChange={(e) => setReminderDueAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              </div>
            </div>

            {/* Totals */}
            {cartItems.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                {parseFloat(discount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-red-600">-₹{parseFloat(discount).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>₹{total.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowLogSale(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => logSaleMutation.mutate()}
              disabled={cartItems.length === 0 || !effectiveLogSaleStore || logSaleMutation.isPending}
            >
              {logSaleMutation.isPending ? 'Logging...' : 'Log Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog open={!!editingSaleId} onOpenChange={(open) => { if (!open) { setEditingSaleId(null); setEditingSaleStoreId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Sale {editingSale?.saleNumber}</DialogTitle>
          </DialogHeader>
          {!editingSale ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Sale Type</label>
                  <Select value={editSaleType} onValueChange={(v: 'walk_in' | 'delivery' | 'website') => setEditSaleType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walk_in">Walk-in</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Payment Method</label>
                  <Select value={editPaymentMethod} onValueChange={(v) => { setEditPaymentMethod(v); if (v !== 'upi') setEditPaymentProofUrl(null); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editPaymentMethod === 'upi' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">UPI payment proof</label>
                  <div className="flex flex-wrap gap-2">
                    <input ref={editProofCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !file.type.startsWith('image/')) return;
                      e.target.value = '';
                      setEditProofUploading(true);
                      try {
                        const result = await api.uploadImage(file, 'sales');
                        setEditPaymentProofUrl(result.secureUrl || result.url);
                      } catch { setEditPaymentProofUrl(null); }
                      finally { setEditProofUploading(false); }
                    }} />
                    <input ref={editProofFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !file.type.startsWith('image/')) return;
                      e.target.value = '';
                      setEditProofUploading(true);
                      try {
                        const result = await api.uploadImage(file, 'sales');
                        setEditPaymentProofUrl(result.secureUrl || result.url);
                      } catch { setEditPaymentProofUrl(null); }
                      finally { setEditProofUploading(false); }
                    }} />
                    <Button type="button" variant="outline" size="sm" onClick={() => editProofCameraRef.current?.click()} disabled={editProofUploading}>
                      <Camera className="h-4 w-4 mr-2" />
                      {editProofUploading ? 'Uploading...' : 'Take photo'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => editProofFileRef.current?.click()} disabled={editProofUploading}>
                      <Upload className="h-4 w-4 mr-2" />
                      {editProofUploading ? 'Uploading...' : 'Upload image'}
                    </Button>
                  </div>
                  {editPaymentProofUrl && (
                    <div className="relative inline-block mt-2">
                      <img src={editPaymentProofUrl} alt="Payment proof" className="h-24 w-auto rounded-lg border object-cover" />
                      <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-muted" onClick={() => setEditPaymentProofUrl(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Sale images</label>
                <p className="text-xs text-muted-foreground">Add receipt photos, delivery proof, etc.</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={editImagesFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files?.length) return;
                      e.target.value = '';
                      for (const file of Array.from(files)) {
                        if (!file.type.startsWith('image/')) continue;
                        try {
                          const result = await api.uploadImage(file, 'sales');
                          setEditImages((prev) => [...prev, result.secureUrl || result.url]);
                        } catch {}
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => editImagesFileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Add image
                  </Button>
                </div>
                {editImages.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {editImages.map((url, idx) => (
                      <div key={url} className="relative">
                        <img src={url} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                        <Button type="button" variant="ghost" size="icon" className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200" onClick={() => setEditImages((p) => p.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Add Products</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={editProductSearch}
                    onChange={(e) => setEditProductSearch(e.target.value)}
                    onFocus={() => setEditProductDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setEditProductDropdownOpen(false), 150)}
                    placeholder="Add more products..."
                    className="pl-10"
                  />
                </div>
                {editProductDropdownOpen && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-white shadow-lg z-10">
                    {editAddableRows.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found.</p>
                    ) : (
                      editAddableRows.map((row: EditAddableRow) => (
                        <button
                          key={`${row.productId}-${row.variantSku ?? 'main'}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); addToEditCart(row); setEditProductSearch(''); }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 text-sm text-left border-b last:border-b-0"
                        >
                          <span>{row.productName}{row.variantName ? ` · ${row.variantName}` : ''}</span>
                          <span className="text-muted-foreground">₹{row.price.toLocaleString()} · {row.stock} in stock</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {editCartItems.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {editCartItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">₹{item.price} x {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={item.maxStock ?? 999}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 1;
                            const cap = item.maxStock ?? 999;
                            setEditCartItems(
                              editCartItems.map((ci, i) =>
                                i === idx ? { ...ci, quantity: Math.min(Math.max(1, val), cap) } : ci,
                              ),
                            );
                          }}
                          className="w-16 h-8 text-center"
                        />
                        <span className="text-sm font-medium w-20 text-right">₹{(item.price * item.quantity).toLocaleString()}</span>
                        <Button variant="ghost" size="sm" onClick={() => setEditCartItems(editCartItems.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Customer Name</label>
                    <Input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Customer Phone</label>
                    <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Customer Address</label>
                  <Textarea value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)} rows={2} className="resize-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Discount</label>
                  <Input type="number" min="0" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Any notes..." />
                </div>
              </div>

              {editCartItems.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>
                      ₹{Math.max(0,
                        editCartItems.reduce((s, i) => s + i.price * i.quantity, 0) - (parseFloat(editDiscount) || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          {editingSale && (
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingSaleId(null); setEditingSaleStoreId(null); }}>Cancel</Button>
              <Button
                onClick={() => updateSaleMutation.mutate()}
                disabled={editCartItems.length === 0 || !editStoreId || updateSaleMutation.isPending}
              >
                {updateSaleMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* View Bill Dialog */}
      <Dialog open={!!viewingBillSale} onOpenChange={(open) => { if (!open) setViewingBillSale(null); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {viewingBillSale && (
            <div className="flex flex-col" style={{ maxHeight: '90vh' }}>
              <DialogTitle className="sr-only">Bill {viewingBillSale.saleNumber}</DialogTitle>
              <div className="overflow-y-auto flex-1">
                <BillDialogContent sale={viewingBillSale} storeName={storeNameForBill(viewingBillSale)} />
              </div>
              <div className="p-4 border-t flex justify-end gap-2 bg-white">
                <Button variant="outline" onClick={() => setViewingBillSale(null)}>Close</Button>
                <Button onClick={() => printBill(viewingBillSale)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Bill
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
