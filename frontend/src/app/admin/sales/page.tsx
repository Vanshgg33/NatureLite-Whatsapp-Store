'use client';

import { useState, useEffect, useRef } from 'react';
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
    queryKey: ['store-sales', selectedStoreId, page, search, saleTypeFilter],
    queryFn: () =>
      api.getStoreSales(selectedStoreId, {
        page,
        limit: 20,
        search,
        saleType: saleTypeFilter || undefined,
      }),
    enabled: !!selectedStoreId,
  });

  const { data: inStockProductsData } = useQuery({
    queryKey: ['store-stock-available', effectiveLogSaleStore, productSearch],
    queryFn: () =>
      api.getStoreStock(effectiveLogSaleStore, {
        search: productSearch || undefined,
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
    queryKey: ['store-stock-available', editStoreId, productSearch],
    queryFn: () =>
      api.getStoreStock(editStoreId, {
        search: productSearch || undefined,
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
        customerAddress: customerAddress || undefined,
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
    const dateStr = new Date(sale.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const itemsHtml = (sale.items || [])
      .map(
        (it: SaleItem) => {
          const p = it.price ?? 0;
          const q = it.quantity ?? 0;
          const lineTotal = it.total ?? p * q;
          return `<tr><td>${it.name}</td><td>${q}</td><td>₹${p.toLocaleString()}</td><td>₹${lineTotal.toLocaleString()}</td></tr>`;
        },
      )
      .join('');
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bill - ${sale.saleNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 24px; max-width: 400px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 4px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
    th { font-weight: 600; }
    .totals { margin-top: 16px; font-size: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .total-row { font-weight: 700; font-size: 16px; margin-top: 8px; padding-top: 8px; border-top: 2px solid #333; }
    .customer { margin: 12px 0; font-size: 13px; color: #444; }
    .footer { margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <h1>${storeName}</h1>
  <div class="meta">Bill #${sale.saleNumber} · ${dateStr}</div>
  ${sale.customerName || sale.customerPhone || sale.customerAddress ? `<div class="customer"><strong>Customer:</strong> ${[sale.customerName, sale.customerPhone, sale.customerAddress].filter(Boolean).join(' · ')}</div>` : ''}
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>₹${(sale.subtotal ?? 0).toLocaleString()}</span></div>
    ${(sale.discount ?? 0) > 0 ? `<div><span>Discount</span><span>-₹${(sale.discount ?? 0).toLocaleString()}</span></div>` : ''}
    <div class="total-row"><span>Total</span><span>₹${(sale.total ?? 0).toLocaleString()}</span></div>
  </div>
  <div class="meta" style="margin-top: 12px;">Payment: ${(sale.paymentMethod || 'cash').toUpperCase()}</div>
  ${sale.notes ? `<div class="customer">Notes: ${sale.notes}</div>` : ''}
  <div class="footer">Thank you for your business</div>
</body>
</html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    const doPrint = () => {
      w.print();
      w.onafterprint = () => w.close();
    };
    if (w.document.readyState === 'complete') {
      setTimeout(doPrint, 100);
    } else {
      w.addEventListener('load', doPrint);
    }
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
                  <div>
                    <p className="font-mono font-medium text-sm">{sale.saleNumber}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Badge variant="secondary" className={badge.className}>
                    {badge.label}
                  </Badge>
                </div>
                <p className="text-sm font-medium mt-1">{sale.customerName || '—'}</p>
                {sale.customerPhone && <p className="text-xs text-gray-500">{sale.customerPhone}</p>}
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
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Sale #</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-600">Customer</th>
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
                      <td className="p-4 text-sm font-mono font-medium">{sale.saleNumber}</td>
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
                      <td className="p-4 text-sm">
                        <div>
                          <p className="font-medium">{sale.customerName || '-'}</p>
                          {sale.customerPhone && (
                            <p className="text-xs text-gray-500">{sale.customerPhone}</p>
                          )}
                          {sale.customerAddress && (
                            <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate" title={sale.customerAddress}>
                              {sale.customerAddress}
                            </p>
                          )}
                        </div>
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
                  <label className="text-sm font-medium">Customer Name (Optional)</label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Customer Phone (Optional)</label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Customer Address (Optional)</label>
                <Textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Street, city, pincode..."
                  rows={2}
                  className="resize-none"
                />
              </div>
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
        <DialogContent className="max-w-md sm:max-w-lg print:max-w-full" id="bill-dialog-content">
          {viewingBillSale && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Bill #{viewingBillSale.saleNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 print:py-2" id="bill-content">
                <div className="border-b pb-3">
                  <h2 className="text-lg font-semibold">{storeNameForBill(viewingBillSale)}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(viewingBillSale.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {(viewingBillSale.customerName || viewingBillSale.customerPhone || viewingBillSale.customerAddress) && (
                  <div className="text-sm">
                    <p className="font-medium text-muted-foreground mb-1">Customer</p>
                    <p>
                      {[viewingBillSale.customerName, viewingBillSale.customerPhone, viewingBillSale.customerAddress]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 font-medium">Item</th>
                        <th className="text-center p-3 font-medium w-12">Qty</th>
                        <th className="text-right p-3 font-medium">Rate</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingBillSale.items || []).map((it: SaleItem, idx: number) => {
                        const p = it.price ?? 0;
                        const q = it.quantity ?? 0;
                        const lineTotal = it.total ?? p * q;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-3">{it.name}</td>
                            <td className="p-3 text-center">{q}</td>
                            <td className="p-3 text-right">₹{p.toLocaleString()}</td>
                            <td className="p-3 text-right">₹{lineTotal.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{(viewingBillSale.subtotal ?? 0).toLocaleString()}</span>
                  </div>
                  {(viewingBillSale.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span>-₹{(viewingBillSale.discount ?? 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span>₹{(viewingBillSale.total ?? 0).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Payment: {(viewingBillSale.paymentMethod || 'cash').toUpperCase()}
                </p>
                {viewingBillSale.notes && (
                  <p className="text-sm text-muted-foreground">Notes: {viewingBillSale.notes}</p>
                )}
              </div>
              <DialogFooter className="print:hidden">
                <Button variant="outline" onClick={() => setViewingBillSale(null)}>
                  Close
                </Button>
                <Button onClick={() => printBill(viewingBillSale)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Bill
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
