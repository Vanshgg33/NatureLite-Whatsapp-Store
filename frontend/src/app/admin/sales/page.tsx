'use client';

import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Search, ShoppingBag, Trash2, Camera, Upload, X, Bell, Pencil, FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
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
import type { Store, StoreSale, StoreStockItem, SaleItem } from '@/types';

const saleTypeBadge: Record<string, { label: string; className: string }> = {
  walk_in: { label: 'Walk-in', className: 'bg-blue-100 text-blue-800' },
  delivery: { label: 'Delivery', className: 'bg-purple-100 text-purple-800' },
  website: { label: 'Website', className: 'bg-green-100 text-green-800' },
};

// ─── Bill Invoice Helpers ──────────────────────────────────────────────────────

const BILL_SELLER = {
  name: 'NATURELITE FOODS',
  legal: '(NATURELITE PVT LTD)',
  addr1: 'B7, Ground Floor, Sector-1',
  addr2: 'Hinganghat, Wardha District',
  addr3: 'Maharashtra – 442 301',
  phone: '8817200740',
  gstin: '22AABCN3598L1ZR',
  state: 'Maharashtra',
  stateCode: '27',
  email: 'hello@naturelite.in',
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

const BILL_PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', netbanking: 'Net Banking', cod: 'Cash on Delivery',
};
const BILL_SALE_TYPE_LABELS: Record<string, string> = {
  walk_in: 'Walk-in', delivery: 'Delivery', website: 'Website',
};
const BS = {
  green: '#1a6b3c', lightGreen: '#e8f5ee', border: '#d1e8db', text: '#1a1a1a', muted: '#666',
};

function BillDialogContent({ sale, storeName }: { sale: StoreSale; storeName: string }) {
  const totalQty = sale.items.reduce((s, i) => s + i.quantity, 0);
  const totalGst = sale.items.reduce((s, item) => s + billItemGst(item), 0);
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const totalItemsGross = sale.items.reduce((s, i) => s + i.total, 0);
  const totalItemsTaxable = totalItemsGross - totalGst;
  const discountPct = sale.subtotal > 0 && sale.discount > 0 ? (sale.discount / sale.subtotal) * 100 : 0;
  const gstRates = sale.items
    .map((i) => (typeof i.product === 'object' && i.product ? (i.product as { gstPercentage?: number }).gstPercentage ?? 0 : 0))
    .filter((r) => r > 0);
  const halfRate = gstRates.length > 0 ? gstRates[0] / 2 : 0;
  const summaryRows: [string, number][] = [
    ['Subtotal (Taxable)', totalItemsTaxable > 0 ? totalItemsTaxable : sale.subtotal],
    ...(sale.discount > 0 ? [['Discount', -sale.discount] as [string, number]] : []),
    ...(totalGst > 0 ? [[`SGST (${halfRate}%)`, sgst] as [string, number], [`CGST (${halfRate}%)`, cgst] as [string, number]] : []),
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: BS.text, fontSize: 12 }}>
      {/* Amount Due Banner */}
      <div style={{ background: BS.green, color: '#fff', padding: '16px 28px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10.5, opacity: 0.75, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Amount Due</div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>₹ {billINR(sale.total)}</div>
        </div>
        <div style={{ textAlign: 'right', opacity: 0.85, fontSize: 11 }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>BILL</div>
          <div>{sale.saleNumber}</div>
        </div>
      </div>

      {/* Seller Info + Logo */}
      <div style={{ padding: '18px 28px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>{BILL_SELLER.name}</div>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>{BILL_SELLER.legal}</div>
          <div style={{ color: BS.muted, lineHeight: 1.7, fontSize: 11.5 }}>
            {BILL_SELLER.addr1},<br />{BILL_SELLER.addr2},<br />{BILL_SELLER.addr3}
          </div>
          <div style={{ color: BS.green, fontWeight: 600, fontSize: 12, marginTop: 5 }}>☎ {BILL_SELLER.phone}</div>
          <div style={{ fontSize: 11.5, color: '#444', marginTop: 3 }}>
            <span style={{ color: BS.muted }}>Company GST : </span><strong>{BILL_SELLER.gstin}</strong>
          </div>
          <div style={{ fontSize: 11, color: BS.muted }}>{BILL_SELLER.state} (State Code: {BILL_SELLER.stateCode})</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="NatureLite" style={{ flexShrink: 0, width: 78, height: 78, objectFit: 'contain' }} />
      </div>

      <div style={{ height: 1, background: BS.border, margin: '0 28px' }} />

      {/* Bill To | Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ padding: '14px 28px' }}>
          <div style={{ fontSize: 10, color: BS.green, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>Bill To:</div>
          {sale.customerName
            ? <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{sale.customerName}</div>
            : <div style={{ fontWeight: 700, fontSize: 14, color: BS.muted, marginBottom: 4, fontStyle: 'italic' }}>Walk-in Customer</div>}
          {sale.customerAddress && <div style={{ color: BS.muted, lineHeight: 1.75, fontSize: 11.5 }}>{sale.customerAddress}</div>}
          {sale.customerPhone && <div style={{ color: BS.green, fontWeight: 600, fontSize: 12, marginTop: 5 }}>☎ {sale.customerPhone}</div>}
          <div style={{ fontSize: 11, color: BS.muted, marginTop: 2 }}>{BILL_SELLER.state}</div>
        </div>
        <div style={{ padding: '14px 28px', borderLeft: `1px solid ${BS.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <tbody>
              {([
                ['Bill No.', sale.saleNumber],
                ['Store', storeName],
                ['Date', billDt(sale.createdAt)],
                ['Sale Type', BILL_SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType],
                ['Payment', BILL_PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod],
              ] as [string, string][]).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: BS.green, fontWeight: 600, padding: '3px 10px 3px 0', whiteSpace: 'nowrap' }}>{k}</td>
                  <td style={{ fontWeight: k === 'Bill No.' ? 700 : 500, padding: '3px 0' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ margin: '0 28px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderTop: `2px solid ${BS.green}`, borderBottom: `2px solid ${BS.green}`, background: BS.lightGreen }}>
              {(['SR', 'Name', 'Qty', 'Price', 'Amount'] as const).map((h, i) => (
                <th key={h} style={{ padding: '8px 6px', textAlign: i === 0 ? 'center' : i >= 2 ? 'right' : 'left', color: BS.green, fontWeight: 700, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item: SaleItem, idx: number) => {
              const gst = billItemGst(item);
              const gstRate = (typeof item.product === 'object' && item.product ? (item.product as { gstPercentage?: number }).gstPercentage : 0) ?? 0;
              const discAmt = sale.subtotal > 0 && sale.discount > 0 ? (item.total / sale.subtotal) * sale.discount : 0;
              return (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafcfb', borderBottom: `1px solid ${BS.border}` }}>
                  <td style={{ padding: '10px 6px', textAlign: 'center', color: '#999', verticalAlign: 'top', fontSize: 11 }}>{idx + 1}</td>
                  <td style={{ padding: '10px 6px', verticalAlign: 'top', fontWeight: 600 }}>
                    {item.name}{item.variantName ? ` ${item.variantName}` : ''}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity} Pac</td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div>{billINR(item.price)}</div>
                    {discountPct > 0 && <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 4 }}>Discount({discountPct.toFixed(0)}%):</div>}
                    {gstRate > 0 && <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 2 }}>GST@{gstRate}%:</div>}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', verticalAlign: 'top', fontWeight: 600 }}>
                    <div>{billINR(item.total)}</div>
                    {discAmt > 0 && <div style={{ color: '#dc2626', fontSize: 10.5, marginTop: 4 }}>– {billINR(discAmt)}</div>}
                    {gstRate > 0 && <div style={{ color: '#aaa', fontSize: 10.5, marginTop: 2 }}>{billINR(gst)}</div>}
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${BS.green}`, background: BS.lightGreen }}>
              <td /><td style={{ padding: '9px 6px', fontWeight: 700, fontSize: 12.5, color: BS.green }}>Total</td>
              <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: BS.green }}>{totalQty}</td>
              <td /><td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: BS.green }}>{billINR(sale.subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary + Tax */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 28px', gap: 20, borderTop: `1px solid ${BS.border}` }}>
        <div>
          <div style={{ fontSize: 10, color: BS.green, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>Tax Details</div>
          {totalGst > 0 ? (
            [['SGST', sgst], ['CGST', cgst]].map(([label, val], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: `1px dashed ${BS.border}` }}>
                <span style={{ color: BS.muted }}>{label} @ {halfRate}%</span>
                <span style={{ fontWeight: 600 }}>{billINR(val as number)}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: BS.muted, fontStyle: 'italic' }}>No GST applicable</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: BS.green, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>Sale Summary</div>
          {summaryRows.map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '2.5px 0' }}>
              <span style={{ color: BS.muted }}>{label}</span>
              <span style={{ color: val < 0 ? '#dc2626' : BS.text, fontWeight: 500 }}>
                {val < 0 ? `– ${billINR(Math.abs(val))}` : billINR(val)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${BS.green}`, marginTop: 6, paddingTop: 6, fontSize: 14, fontWeight: 700, color: BS.green }}>
            <span>Grand Total</span><span>₹ {billINR(sale.total)}</span>
          </div>
          {sale.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
              <span>🎉 You Saved</span><span>{billINR(sale.discount)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Amount in Words */}
      <div style={{ background: BS.lightGreen, borderTop: `1px solid ${BS.border}`, padding: '10px 28px', fontSize: 11.5 }}>
        <strong style={{ color: BS.green }}>Amount in Words : </strong>
        <span style={{ fontStyle: 'italic', color: '#444' }}>{billToWords(sale.total)}</span>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${BS.border}` }}>
        <div>
          <div style={{ fontSize: 12, color: BS.muted, fontStyle: 'italic', marginBottom: 8 }}>Thanks for doing business with us!</div>
          <div style={{ fontSize: 10, color: '#bbb' }}>This is a computer-generated bill and does not require a physical signature.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: BS.muted, marginBottom: 28 }}>For {BILL_SELLER.name}</div>
          <div style={{ borderTop: '1px solid #999', paddingTop: 4, fontSize: 10.5, color: '#666', minWidth: 130 }}>Authorised Signatory</div>
        </div>
      </div>

      {/* Green sub-footer */}
      <div style={{ background: BS.green, color: '#fff', textAlign: 'center', padding: '7px 20px', fontSize: 10.5, opacity: 0.92, letterSpacing: 0.3 }}>
        {BILL_SELLER.email} &nbsp;·&nbsp; {BILL_SELLER.addr2} &nbsp;·&nbsp; {BILL_SELLER.state}
      </div>
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

  const { data: inStockProductsData } = useQuery({
    queryKey: ['store-stock-available', effectiveLogSaleStore, debouncedProductSearch],
    queryFn: () =>
      api.getStoreStock(effectiveLogSaleStore, {
        search: debouncedProductSearch || undefined,
        inStockOnly: true,
        limit: 50,
        page: 1,
      }),
    enabled: !!effectiveLogSaleStore && showLogSale,
  });
  const rawStockItems = (inStockProductsData?.items ?? []) as StoreStockItem[];

  // Flatten to one row per SKU (product main or variant) so we always specify which SKU is sold
  type AddableRow = {
    productId: string;
    productName: string;
    productSku?: string;
    variantSku?: string;
    variantName?: string;
    price: number;
    stock: number;
    _storeStockId: string;
  };
  const addableRows: AddableRow[] = [];
  rawStockItems.forEach((item: StoreStockItem) => {
    const productId = typeof item.product === 'string' ? item.product : (item.product as { _id: string })._id;
    const productName = item.productName ?? '';
    const productSku = item.productSku;
    const variants = item.productVariants ?? [];

    const hasVariantStock = item.variantStocks?.some((v) => (v.stock ?? 0) > 0);
    const hasMainStock = (item.stock ?? 0) > 0;

    if (hasVariantStock && item.variantStocks?.length) {
      item.variantStocks.forEach((vs) => {
        const qty = vs.stock ?? 0;
        if (qty <= 0) return;
        const variant = variants.find((v) => v.sku === vs.variantSku);
        addableRows.push({
          productId,
          productName,
          productSku,
          variantSku: vs.variantSku,
          variantName: variant?.name,
          price: variant?.price ?? item.productPrice ?? 0,
          stock: qty,
          _storeStockId: item._id,
        });
      });
    }
    if (hasMainStock) {
      addableRows.push({
        productId,
        productName,
        productSku,
        variantSku: undefined,
        variantName: undefined,
        price: item.productPrice ?? 0,
        stock: item.stock ?? 0,
        _storeStockId: item._id,
      });
    }
  });
  const productResults = addableRows;

  const editStoreId = editingSaleStoreId || (editingSale
    ? (typeof editingSale.store === 'object' ? (editingSale.store as { _id: string })._id : editingSale.store)
    : selectedStoreId);

  const { data: editInStockData } = useQuery({
    queryKey: ['store-stock-available', editStoreId, debouncedEditProductSearch],
    queryFn: () =>
      api.getStoreStock(editStoreId, {
        search: debouncedEditProductSearch || undefined,
        inStockOnly: true,
        limit: 50,
        page: 1,
      }),
    enabled: !!editingSaleId && !!editStoreId,
  });
  const editRawStockItems = (editInStockData?.items ?? []) as StoreStockItem[];
  type EditAddableRow = {
    productId: string;
    productName: string;
    productSku?: string;
    variantSku?: string;
    variantName?: string;
    price: number;
    stock: number;
    _storeStockId: string;
  };
  const editAddableRows: EditAddableRow[] = [];
  editRawStockItems.forEach((item: StoreStockItem) => {
    const productId = typeof item.product === 'string' ? item.product : (item.product as { _id: string })._id;
    const productName = item.productName ?? '';
    const productSku = item.productSku;
    const variants = item.productVariants ?? [];
    const hasVariantStock = item.variantStocks?.some((v) => (v.stock ?? 0) > 0);
    const hasMainStock = (item.stock ?? 0) > 0;
    if (hasVariantStock && item.variantStocks?.length) {
      item.variantStocks.forEach((vs) => {
        const qty = vs.stock ?? 0;
        if (qty <= 0) return;
        const variant = variants.find((v) => v.sku === vs.variantSku);
        editAddableRows.push({
          productId,
          productName,
          productSku,
          variantSku: vs.variantSku,
          variantName: variant?.name,
          price: variant?.price ?? item.productPrice ?? 0,
          stock: qty,
          _storeStockId: item._id,
        });
      });
    }
    if (hasMainStock) {
      editAddableRows.push({
        productId,
        productName,
        productSku,
        variantSku: undefined,
        variantName: undefined,
        price: item.productPrice ?? 0,
        stock: item.stock ?? 0,
        _storeStockId: item._id,
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
    const storeName = storeNameForBill(sale);
    const totalQty = sale.items.reduce((s: number, i: SaleItem) => s + i.quantity, 0);
    const totalGst = sale.items.reduce((s: number, item: SaleItem) => s + billItemGst(item), 0);
    const cgst = totalGst / 2;
    const sgst = totalGst / 2;
    const totalItemsGross = sale.items.reduce((s: number, i: SaleItem) => s + i.total, 0);
    const totalItemsTaxable = totalItemsGross - totalGst;
    const discountPct = sale.subtotal > 0 && sale.discount > 0 ? (sale.discount / sale.subtotal) * 100 : 0;
    const gstRates = sale.items
      .map((i: SaleItem) => (typeof i.product === 'object' && i.product ? (i.product as { gstPercentage?: number }).gstPercentage ?? 0 : 0))
      .filter((r: number) => r > 0);
    const halfRate = gstRates.length > 0 ? gstRates[0] / 2 : 0;
    const logoUrl = window.location.origin + '/images/logo.png';

    const itemsHtml = sale.items.map((it: SaleItem, idx: number) => {
      const gst = billItemGst(it);
      const gstRate = (typeof it.product === 'object' && it.product ? (it.product as { gstPercentage?: number }).gstPercentage : 0) ?? 0;
      const discAmt = sale.subtotal > 0 && sale.discount > 0 ? (it.total / sale.subtotal) * sale.discount : 0;
      const bg = idx % 2 === 0 ? '#fff' : '#fafcfb';
      const priceExtra = (discountPct > 0 ? `<div style="color:#aaa;font-size:10.5px;margin-top:4px">Discount(${discountPct.toFixed(0)}%):</div>` : '')
        + (gstRate > 0 ? `<div style="color:#aaa;font-size:10.5px;margin-top:2px">GST@${gstRate}%:</div>` : '');
      const amtExtra = (discAmt > 0 ? `<div style="color:#dc2626;font-size:10.5px;margin-top:4px">– ${billINR(discAmt)}</div>` : '')
        + (gstRate > 0 ? `<div style="color:#aaa;font-size:10.5px;margin-top:2px">${billINR(gst)}</div>` : '');
      return `<tr style="background:${bg};border-bottom:1px solid #d1e8db">
        <td style="padding:10px 6px;text-align:center;color:#999;vertical-align:top;font-size:11px">${idx + 1}</td>
        <td style="padding:10px 6px;font-weight:600;vertical-align:top">${it.name}${it.variantName ? ` ${it.variantName}` : ''}</td>
        <td style="padding:10px 6px;text-align:right;vertical-align:top">${it.quantity} Pac</td>
        <td style="padding:10px 6px;text-align:right;vertical-align:top">${billINR(it.price)}${priceExtra}</td>
        <td style="padding:10px 6px;text-align:right;font-weight:600;vertical-align:top">${billINR(it.total)}${amtExtra}</td>
      </tr>`;
    }).join('');

    const taxHtml = totalGst > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed #d1e8db"><span style="color:#666">SGST @ ${halfRate}%</span><span style="font-weight:600">${billINR(sgst)}</span></div><div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span style="color:#666">CGST @ ${halfRate}%</span><span style="font-weight:600">${billINR(cgst)}</span></div>`
      : '<div style="font-size:12px;color:#666;font-style:italic">No GST applicable</div>';

    const summaryRows: [string, number][] = [
      ['Subtotal (Taxable)', totalItemsTaxable > 0 ? totalItemsTaxable : sale.subtotal],
      ...(sale.discount > 0 ? [['Discount', -sale.discount] as [string, number]] : []),
      ...(totalGst > 0 ? [[`SGST (${halfRate}%)`, sgst] as [string, number], [`CGST (${halfRate}%)`, cgst] as [string, number]] : []),
    ];
    const summaryHtml = summaryRows.map(([label, val]) =>
      `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:2.5px 0"><span style="color:#666">${label}</span><span style="color:${val < 0 ? '#dc2626' : '#1a1a1a'};font-weight:500">${val < 0 ? '– ' + billINR(Math.abs(val)) : billINR(val)}</span></div>`
    ).join('');

    const metaRows = [
      ['Bill No.', sale.saleNumber], ['Store', storeName], ['Date', billDt(sale.createdAt)],
      ['Sale Type', BILL_SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType],
      ['Payment', BILL_PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod],
    ];

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill - ${sale.saleNumber}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;color:#1a1a1a;font-size:12px}
@media print{body{background:white}.np{display:none!important}.inv{box-shadow:none!important;margin:0!important;max-width:100%!important}@page{size:A4 portrait;margin:6mm 8mm}}</style></head>
<body>
<div class="np" style="position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 4px rgba(0,0,0,.06)">
  <div style="font-weight:700;color:#1a6b3c;font-size:14px">Bill — ${sale.saleNumber}</div>
  <div style="display:flex;gap:8px">
    <button onclick="window.print()" style="background:#f0faf4;color:#1a6b3c;border:1px solid #d1e8db;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer">Print</button>
    <button onclick="window.close()" style="background:#fff;color:#666;border:1px solid #e5e7eb;border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer">✕</button>
  </div>
</div>
<div style="padding:24px 16px 40px">
<div class="inv" style="max-width:720px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:#1a6b3c;color:#fff;padding:16px 28px 14px;display:flex;align-items:center;justify-content:space-between">
    <div><div style="font-size:10.5px;opacity:.75;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Amount Due</div><div style="font-size:32px;font-weight:800;line-height:1">₹ ${billINR(sale.total)}</div></div>
    <div style="text-align:right;opacity:.85;font-size:11px"><div style="font-weight:700;margin-bottom:2px">BILL</div><div>${sale.saleNumber}</div></div>
  </div>
  <div style="padding:18px 28px 14px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-weight:800;font-size:15px">${BILL_SELLER.name}</div>
      <div style="font-weight:600;font-size:12px;color:#555;margin-bottom:6px">${BILL_SELLER.legal}</div>
      <div style="color:#666;line-height:1.7;font-size:11.5px">${BILL_SELLER.addr1},<br>${BILL_SELLER.addr2},<br>${BILL_SELLER.addr3}</div>
      <div style="color:#1a6b3c;font-weight:600;font-size:12px;margin-top:5px">☎ ${BILL_SELLER.phone}</div>
      <div style="font-size:11.5px;color:#444;margin-top:3px">Company GST : <strong>${BILL_SELLER.gstin}</strong></div>
      <div style="font-size:11px;color:#666">${BILL_SELLER.state} (State Code: ${BILL_SELLER.stateCode})</div>
    </div>
    <img src="${logoUrl}" alt="NatureLite" style="width:78px;height:78px;object-fit:contain;flex-shrink:0">
  </div>
  <div style="height:1px;background:#d1e8db;margin:0 28px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr">
    <div style="padding:14px 28px">
      <div style="font-size:10px;color:#1a6b3c;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:5px">Bill To:</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${sale.customerName || '<span style="color:#666;font-style:italic">Walk-in Customer</span>'}</div>
      ${sale.customerAddress ? `<div style="color:#666;line-height:1.75;font-size:11.5px">${sale.customerAddress}</div>` : ''}
      ${sale.customerPhone ? `<div style="color:#1a6b3c;font-weight:600;font-size:12px;margin-top:5px">☎ ${sale.customerPhone}</div>` : ''}
      <div style="font-size:11px;color:#666;margin-top:2px">${BILL_SELLER.state}</div>
    </div>
    <div style="padding:14px 28px;border-left:1px solid #d1e8db">
      <table style="width:100%;border-collapse:collapse;font-size:11.5px"><tbody>
        ${metaRows.map(([k, v]) => `<tr><td style="color:#1a6b3c;font-weight:600;padding:3px 10px 3px 0;white-space:nowrap">${k}</td><td style="padding:3px 0">${v}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
  <div style="margin:0 28px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-top:2px solid #1a6b3c;border-bottom:2px solid #1a6b3c;background:#e8f5ee">
        <th style="padding:8px 6px;text-align:center;color:#1a6b3c;font-size:11px">SR</th>
        <th style="padding:8px 6px;text-align:left;color:#1a6b3c;font-size:11px">Name</th>
        <th style="padding:8px 6px;text-align:right;color:#1a6b3c;font-size:11px">Qty</th>
        <th style="padding:8px 6px;text-align:right;color:#1a6b3c;font-size:11px">Price</th>
        <th style="padding:8px 6px;text-align:right;color:#1a6b3c;font-size:11px">Amount</th>
      </tr></thead>
      <tbody>${itemsHtml}
        <tr style="border-top:2px solid #1a6b3c;background:#e8f5ee">
          <td></td><td style="padding:9px 6px;font-weight:700;font-size:12.5px;color:#1a6b3c">Total</td>
          <td style="padding:9px 6px;text-align:right;font-weight:700;color:#1a6b3c">${totalQty}</td>
          <td></td><td style="padding:9px 6px;text-align:right;font-weight:700;color:#1a6b3c">${billINR(sale.subtotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;padding:14px 28px;gap:20px;border-top:1px solid #d1e8db">
    <div>
      <div style="font-size:10px;color:#1a6b3c;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:5px">Tax Details</div>
      ${taxHtml}
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:#1a6b3c;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:5px">Sale Summary</div>
      ${summaryHtml}
      <div style="display:flex;justify-content:space-between;border-top:2px solid #1a6b3c;margin-top:6px;padding-top:6px;font-size:14px;font-weight:700;color:#1a6b3c">
        <span>Grand Total</span><span>₹ ${billINR(sale.total)}</span>
      </div>
      ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:5px;font-size:12px;color:#16a34a;font-weight:600"><span>🎉 You Saved</span><span>${billINR(sale.discount)}</span></div>` : ''}
    </div>
  </div>
  <div style="background:#e8f5ee;border-top:1px solid #d1e8db;padding:10px 28px;font-size:11.5px">
    <strong style="color:#1a6b3c">Amount in Words : </strong><span style="font-style:italic;color:#444">${billToWords(sale.total)}</span>
  </div>
  <div style="padding:14px 28px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #d1e8db">
    <div>
      <div style="font-size:12px;color:#666;font-style:italic;margin-bottom:8px">Thanks for doing business with us!</div>
      <div style="font-size:10px;color:#bbb">This is a computer-generated bill and does not require a physical signature.</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10.5px;color:#666;margin-bottom:28px">For ${BILL_SELLER.name}</div>
      <div style="border-top:1px solid #999;padding-top:4px;font-size:10.5px;color:#666;min-width:130px">Authorised Signatory</div>
    </div>
  </div>
  <div style="background:#1a6b3c;color:#fff;text-align:center;padding:7px 20px;font-size:10.5px;letter-spacing:.3px">
    ${BILL_SELLER.email} &nbsp;·&nbsp; ${BILL_SELLER.addr2} &nbsp;·&nbsp; ${BILL_SELLER.state}
  </div>
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
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewingBillSale(sale)}>
                    <FileText className="h-4 w-4 mr-1" />
                    Bill
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
                    <FileText className="h-4 w-4 mr-1" />
                    GST Invoice
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
                  placeholder="Select or search in-stock products..."
                  className="pl-10"
                  readOnly={false}
                />
              </div>
              {productDropdownOpen && (
                <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-white shadow-lg z-10">
                  {productResults.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No in-stock products found. Only products with stock at this store are listed.
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
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">No in-stock products</p>
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
