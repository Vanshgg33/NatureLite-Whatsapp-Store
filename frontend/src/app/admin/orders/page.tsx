'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, Plus, Trash2, ShoppingCart, MessageCircle, Globe, Download, Send, Loader2, Edit, Phone, Receipt, Building2, Truck, Bell, RotateCcw, Printer } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getApiError } from '@/lib/api-error';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, useDebouncedValue } from '@/lib/utils';
import { captureInvoicePdf, billFilename, base64ToBlob } from '@/lib/bill-pdf';
import { useToast } from '@/components/ui/use-toast';
import { OrderStatus, Product, Order } from '@/types';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'placed', label: 'Placed' },
  { value: 'confirmed', label: 'Packed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
  { value: 'refunded', label: 'Refunded' },
];

type CartItem = {
  productId: string;
  variantSku?: string;
  name: string;
  price: number;
  quantity: number;
};

type ProductRow = {
  productId: string;
  name: string;
  variantSku?: string;
  variantName?: string;
  price: number;
  stock: number;
  trackStock: boolean;
};

function flattenProductRows(products: Product[]): ProductRow[] {
  const rows: ProductRow[] = [];
  for (const p of products) {
    const allVariants = p.variants ?? [];
    if (allVariants.length > 0) {
      for (const v of allVariants) {
        rows.push({
          productId: p._id,
          name: p.name,
          variantSku: v.sku,
          variantName: v.name,
          price: v.price,
          stock: v.stock ?? 0,
          trackStock: p.trackStock !== false,
        });
      }
    } else {
      rows.push({
        productId: p._id,
        name: p.name,
        price: p.price,
        stock: p.stock ?? 0,
        trackStock: p.trackStock !== false,
      });
    }
  }
  return rows;
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // List state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [status, setStatus] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<string | null>(null);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);

  // Edit order state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [editShipName, setEditShipName] = useState('');
  const [editShipPhone, setEditShipPhone] = useState('');
  const [editShipStreet, setEditShipStreet] = useState('');
  const [editShipLandmark, setEditShipLandmark] = useState('');
  const [editShipCity, setEditShipCity] = useState('');
  const [editShipState, setEditShipState] = useState('');
  const [editShipPincode, setEditShipPincode] = useState('');
  const [editError, setEditError] = useState('');

  // Create order dialog
  const [showCreate, setShowCreate] = useState(false);
  const [source, setSource] = useState<'whatsapp' | 'website' | 'phone' | 'vayepar' | 'b2b'>('whatsapp');
  const [orderType, setOrderType] = useState<'b2b' | 'other_cities' | 'transport' | ''>('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAltPhone, setCustAltPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('Chhattisgarh');
  const [addrPincode, setAddrPincode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi' | 'card' | 'netbanking'>('cod');
  const [upiProofFile, setUpiProofFile] = useState<File | null>(null);
  const [upiProofPreview, setUpiProofPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [discountIsPercent, setDiscountIsPercent] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [createError, setCreateError] = useState('');

  // Reminder state (create dialog)
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderDueAt, setReminderDueAt] = useState('');

  // Delete order state
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);

  // Edit order — product cart state + discount
  const [editCart, setEditCart] = useState<CartItem[]>([]);
  const [editDiscount, setEditDiscount] = useState('0');
  const [editDiscountIsPercent, setEditDiscountIsPercent] = useState(false);
  const [editShippingCharge, setEditShippingCharge] = useState('0');
  const [editProductSearch, setEditProductSearch] = useState('');
  const [editProductDropdownOpen, setEditProductDropdownOpen] = useState(false);
  const debouncedEditProductSearch = useDebouncedValue(editProductSearch, 300);

  const { data: ordersData, isLoading, isFetching } = useQuery({
    queryKey: ['orders', page, debouncedSearch, status, cityFilter, startDate, endDate],
    queryFn: () =>
      api.getOrders({
        page,
        limit: 20,
        search: debouncedSearch,
        status: (status || undefined) as OrderStatus | undefined,
        city: cityFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  });

  const { data: productSearchResults = [], isFetching: productSearchFetching } = useQuery({
    queryKey: ['product-search', debouncedProductSearch],
    queryFn: () => api.searchProducts(debouncedProductSearch, 20),
    enabled: !!debouncedProductSearch && showCreate,
  });
  const productRows = flattenProductRows(productSearchResults as Product[]);
  const productSearchLoading = productSearchFetching || (!!productSearch && productSearch !== debouncedProductSearch);

  const { data: editProductSearchResults = [], isFetching: editProductSearchFetching } = useQuery({
    queryKey: ['product-search-edit', debouncedEditProductSearch],
    queryFn: () => api.searchProducts(debouncedEditProductSearch, 20),
    enabled: !!debouncedEditProductSearch && editingOrder !== null,
  });
  const editProductRows = flattenProductRows(editProductSearchResults as Product[]);
  const editProductSearchLoading = editProductSearchFetching || (!!editProductSearch && editProductSearch !== debouncedEditProductSearch);

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.adminCreateOrder({
        items: cart.map((i) => ({ productId: i.productId, variantSku: i.variantSku, quantity: i.quantity })),
        shippingAddress: {
          name: custName.trim(),
          phone: custPhone.trim(),
          alternatePhone: custAltPhone.trim() || undefined,
          street: addrStreet.trim(),
          landmark: addrLandmark.trim() || undefined,
          city: addrCity.trim(),
          state: addrState.trim(),
          pincode: addrPincode.trim() || undefined,
        },
        paymentMethod,
        phone: custPhone.trim(),
        name: custName.trim(),
        notes: notes.trim()
          ? `[${source === 'whatsapp' ? 'WhatsApp' : source === 'website' ? 'Website' : source === 'phone' ? 'Phone' : source === 'b2b' ? 'B2B' : 'Vayepar'}] ${notes.trim()}`
          : `[${source === 'whatsapp' ? 'WhatsApp' : source === 'website' ? 'Website' : source === 'phone' ? 'Phone' : source === 'b2b' ? 'B2B' : 'Vayepar'}] Order created by admin`,
        source,
        orderType: orderType || undefined,
        adminDiscount: discountAmount > 0 ? discountAmount : undefined,
        scheduledFor: reminderDueAt || undefined,
      }),
    onSuccess: async (order) => {
      if (upiProofFile) {
        try {
          const uploaded = await api.uploadImage(upiProofFile, 'payment-proofs');
          await api.updateOrder(order._id, { paymentProofUrl: uploaded.secureUrl || uploaded.url });
        } catch {
          // proof upload failed silently — order still created
        }
      }
      if (reminderDueAt) {
        const msg = reminderMessage.trim() || `Follow up on order ${order.orderNumber}`;
        await api.createOrderReminder(order._id, msg, reminderDueAt).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      resetCreateForm();
      setShowCreate(false);
    },
    onError: (err: unknown) => {
      setCreateError(getApiError(err, 'Failed to create order'));
    },
  });

  function resetCreateForm() {
    setSource('whatsapp');
    setOrderType('');
    setCustName('');
    setCustPhone('');
    setCustAltPhone('');
    setAddrStreet('');
    setAddrLandmark('');
    setAddrCity('');
    setAddrState('Chhattisgarh');
    setAddrPincode('');
    setPaymentMethod('cod');
    setUpiProofFile(null);
    if (upiProofPreview) URL.revokeObjectURL(upiProofPreview);
    setUpiProofPreview(null);
    setNotes('');
    setDiscount('0');
    setDiscountIsPercent(false);
    setCart([]);
    setProductSearch('');
    setReminderMessage('');
    setReminderDueAt('');
    setCreateError('');
  }

  async function handleDownloadBill(order: Order) {
    setBillLoadingId(order._id);
    try {
      const b64 = await captureInvoicePdf(`/invoice/${order._id}`, order._id);
      const blob = base64ToBlob(b64);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = billFilename(order.shippingAddress?.name ?? '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast({ title: 'Failed to generate PDF', description: getApiError(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setBillLoadingId(null);
    }
  }

  function handlePrintBill(order: Order) {
    setPrintLoadingId(order._id);
    const popup = window.open(
      `/invoice/${order._id}?mode=print`,
      '_blank',
      'width=900,height=700,scrollbars=yes,resizable=yes',
    );
    if (!popup) {
      toast({ title: 'Popup blocked', description: 'Allow popups for this site and try again.', variant: 'destructive' });
    }
    setTimeout(() => setPrintLoadingId(null), 1500);
  }

  async function handleSendBill(order: Order) {
    setSendLoadingId(order._id);
    try {
      const b64 = await captureInvoicePdf(`/invoice/${order._id}`, order._id);
      await api.uploadOrderInvoice(order._id, b64, billFilename(order.shippingAddress?.name ?? ''));
      await api.sendOrderInvoice(order._id);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Invoice sent!', description: `Bill for ${order.orderNumber} sent to customer via WhatsApp.` });
    } catch (err: unknown) {
      toast({ title: 'Failed to send invoice', description: getApiError(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setSendLoadingId(null);
    }
  }

  function addToCart(row: ProductRow) {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? ''),
      );
      if (existing) {
        return prev.map((i) =>
          i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? '')
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [...prev, {
        productId: row.productId,
        variantSku: row.variantSku,
        name: row.variantName ? `${row.name} · ${row.variantName}` : row.name,
        price: row.price,
        quantity: 1,
      }];
    });
    setProductSearch('');
  }

  function addToEditCart(row: ProductRow) {
    setEditCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? ''),
      );
      if (existing) {
        return prev.map((i) =>
          i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? '')
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [...prev, {
        productId: row.productId,
        variantSku: row.variantSku,
        name: row.variantName ? `${row.name} · ${row.variantName}` : row.name,
        price: row.price,
        quantity: 1,
      }];
    });
    setEditProductSearch('');
  }

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmount = discountIsPercent
    ? cartSubtotal * (Math.min(parseFloat(discount) || 0, 100) / 100)
    : (parseFloat(discount) || 0);
  const cartTotal = Math.max(0, cartSubtotal - discountAmount);

  const canSubmit =
    custName.trim() &&
    custPhone.trim().length >= 10 &&
    addrStreet.trim() &&
    addrCity.trim() &&
    cart.length > 0;

  const updateOrderMutation = useMutation({
    mutationFn: (data: { id: string; payload: any }) => api.updateOrder(data.id, data.payload),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      const prev = queryClient.getQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate]);
      queryClient.setQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((o: any) => o._id === data.id ? { ...o, ...data.payload } : o) };
      });
      return { prev };
    },
    onSuccess: () => {
      toast({ title: 'Order updated', description: 'The order details have been successfully updated.' });
      setEditingOrder(null);
    },
    onError: (err: unknown, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate], context.prev);
      setEditError(getApiError(err, 'Failed to update order'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => api.deleteOrder(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      const prev = queryClient.getQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate]);
      queryClient.setQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((o: any) => o._id !== id) };
      });
      return { prev };
    },
    onSuccess: () => {
      toast({ title: 'Order deleted', description: 'The order has been permanently deleted.' });
      setDeletingOrder(null);
    },
    onError: (err: unknown, _id, context: any) => {
      if (context?.prev) queryClient.setQueryData(['orders', page, debouncedSearch, status, cityFilter, startDate, endDate], context.prev);
      toast({ title: 'Delete failed', description: getApiError(err, 'Failed to delete order'), variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const restoreOrderMutation = useMutation({
    mutationFn: ({ id, view }: { id: string; view: 'packing' | 'billing' }) =>
      api.restoreOrderToView(id, view),
    onSuccess: (_data, { view }) => {
      toast({ title: `Order sent back to ${view} queue` });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      toast({ title: 'Failed to restore order', variant: 'destructive' });
    },
  });

  function startEditing(order: Order) {
    setEditingOrder(order);
    setEditStatus(order.status || '');
    setEditPaymentStatus(order.paymentStatus || '');
    setEditPaymentMethod(order.paymentMethod || '');
    setEditNotes(order.notes || '');
    setEditAdminNotes(order.adminNotes || '');
    setEditShipName(order.shippingAddress?.name || '');
    setEditShipPhone(order.shippingAddress?.phone || '');
    setEditShipStreet(order.shippingAddress?.street || '');
    setEditShipLandmark(order.shippingAddress?.landmark || '');
    setEditShipCity(order.shippingAddress?.city || '');
    setEditShipState(order.shippingAddress?.state || '');
    setEditShipPincode(order.shippingAddress?.pincode || '');
    setEditError('');
    setEditDiscount(String(order.discount ?? 0));
    setEditDiscountIsPercent(false);
    setEditShippingCharge(String(order.shippingCharge ?? 0));
    setEditProductSearch('');
    setEditCart(
      (order.items || []).map((item) => ({
        productId: typeof item.product === 'string' ? item.product : (item.product as any)?._id ?? '',
        variantSku: item.variantSku,
        name: item.variantName ? `${item.name} · ${item.variantName}` : item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    );
  }

  function handleSaveEdit() {
    if (!editingOrder) return;
    setEditError('');
    updateOrderMutation.mutate({
      id: editingOrder._id,
      payload: {
        status: editStatus,
        paymentStatus: editPaymentStatus,
        paymentMethod: editPaymentMethod,
        notes: editNotes,
        adminNotes: editAdminNotes,
        shippingAddress: {
          name: editShipName.trim(),
          phone: editShipPhone.trim(),
          street: editShipStreet.trim(),
          landmark: editShipLandmark.trim() || undefined,
          city: editShipCity.trim(),
          state: editShipState.trim(),
          pincode: editShipPincode.trim() || undefined,
        },
        items: editCart.map((i) => ({ productId: i.productId, variantSku: i.variantSku || undefined, quantity: i.quantity })),
        discount: editDiscountIsPercent
          ? editCart.reduce((s, i) => s + i.price * i.quantity, 0) * (Math.min(parseFloat(editDiscount) || 0, 100) / 100)
          : (parseFloat(editDiscount) || 0),
        shippingCharge: parseFloat(editShippingCharge) || 0,
      },
    });
  }

  return (
    <div>
      <Header title="Orders" description="Manage customer orders" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Top bar with Create Order button */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">City:</span>
            <select
              className={`h-9 rounded-md border px-3 py-1 text-sm font-medium transition-colors ${cityFilter ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-input bg-background'}`}
              value={selectedStore}
              onChange={(e) => {
                const city = e.target.value;
                setSelectedStore(city);
                setCityFilter(city);
                setPage(1);
              }}
            >
              <option value="">All Cities</option>
              <option value="Raipur">Raipur</option>
              <option value="Bhilai">Bhilai</option>
              <option value="Durg">Durg</option>
            </select>
            {cityFilter && (
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                {ordersData?.total ?? '…'} orders
              </span>
            )}
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Order
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:px-6 sm:pb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <div className="relative flex-1 min-w-0 max-w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search by order # or phone..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Status:</span>
                  <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}

                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">From:</span>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                    className="h-10 w-[140px] sm:w-[160px] text-sm text-foreground"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">To:</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                    className="h-10 w-[140px] sm:w-[160px] text-sm text-foreground"
                  />
                </div>

                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setPage(1);
                    }}
                    className="h-10 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear Dates
                  </Button>
                )}
              </div>
            </div>

            {isFetching && !isLoading && (
              <div className="h-0.5 w-full bg-primary/20 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-primary animate-pulse w-1/2 rounded-full" />
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : ordersData?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted/50 p-4 mb-4">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No orders found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {search || status || cityFilter || startDate || endDate ? 'Try adjusting your filters.' : 'Orders will appear here once customers start purchasing.'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersData?.items.map((order) => (
                        <TableRow key={order._id}>
                          <TableCell>
                            <div>
                              <p className="font-medium leading-tight">{order.shippingAddress?.name ?? '—'}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                                {order.shippingAddress?.city}, {order.shippingAddress?.state} – {order.shippingAddress?.pincode}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1.5">
                                <span>{order.orderNumber}</span>
                                {(() => {
                                  const src = order.source ?? 'website';
                                  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
                                    whatsapp:  { label: 'WhatsApp',  icon: <MessageCircle className="h-2.5 w-2.5" />, cls: 'bg-green-50 text-green-700 border-green-200' },
                                    website:   { label: 'Website',   icon: <Globe className="h-2.5 w-2.5" />,         cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                                    phone:     { label: 'Phone',     icon: <Phone className="h-2.5 w-2.5" />,          cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                                    vayepar:   { label: 'Vyapar',    icon: <Receipt className="h-2.5 w-2.5" />,        cls: 'bg-purple-50 text-purple-700 border-purple-200' },
                                    b2b:       { label: 'B2B',       icon: <Building2 className="h-2.5 w-2.5" />,      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
                                    transport: { label: 'Transport', icon: <Truck className="h-2.5 w-2.5" />,          cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
                                  };
                                  const s = map[src] ?? map.website;
                                  return (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium leading-none border ${s.cls}`}>
                                      {s.icon}{s.label}
                                    </span>
                                  );
                                })()}
                                {order.orderType && (() => {
                                  const typeMap: Record<string, { label: string; cls: string }> = {
                                    b2b:          { label: 'B2B',          cls: 'bg-orange-50 text-orange-700 border-orange-200' },
                                    other_cities: { label: 'Other Cities', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                                    transport:    { label: 'Transport',    cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
                                  };
                                  const t = typeMap[order.orderType];
                                  return t ? (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium leading-none border ${t.cls}`}>
                                      {t.label}
                                    </span>
                                  ) : null;
                                })()}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{order.items.length} items</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{formatCurrency(order.total)}</p>
                              <p className="text-xs text-muted-foreground uppercase">
                                {order.paymentMethod}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(order.paymentStatus)}>
                              {order.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge className={getStatusColor(order.status)}>{
                            order.status === 'confirmed' ? 'Packed' :
                            order.status === 'out_for_delivery' ? 'Out for Delivery' :
                            order.status.charAt(0).toUpperCase() + order.status.slice(1)
                          }</Badge>
                              {order.scheduledFor && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold leading-none bg-amber-100 text-amber-700 border border-amber-300 w-fit">
                                  SCHEDULED
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {order.scheduledFor ? (
                              <div>
                                <p className="font-semibold text-amber-700">{formatDate(order.scheduledFor)}</p>
                                <p className="text-xs text-muted-foreground">sched.</p>
                              </div>
                            ) : (
                              formatDate(order.createdAt)
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Download bill PDF"
                                disabled={billLoadingId === order._id}
                                onClick={() => handleDownloadBill(order)}
                              >
                                {billLoadingId === order._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Print bill"
                                disabled={printLoadingId === order._id}
                                onClick={() => handlePrintBill(order)}
                              >
                                {printLoadingId === order._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={order.shippingAddress?.phone ? 'Send bill to customer via WhatsApp' : 'No phone on order'}
                                disabled={sendLoadingId === order._id || !order.shippingAddress?.phone}
                                onClick={() => handleSendBill(order)}
                              >
                                {sendLoadingId === order._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit order"
                                onClick={() => startEditing(order)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {order.dismissedFromViews?.includes('packing') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Send back to packing"
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => restoreOrderMutation.mutate({ id: order._id, view: 'packing' })}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              {order.dismissedFromViews?.includes('billing') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Send back to billing"
                                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                  onClick={() => restoreOrderMutation.mutate({ id: order._id, view: 'billing' })}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Delete order"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeletingOrder(order)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Link href={`/admin/orders/${order._id}`}>
                                <Button variant="ghost" size="icon" aria-label="View order">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {ordersData && ordersData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, ordersData.total)} of{' '}
                      {ordersData.total} orders
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={!ordersData.hasPrevious}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!ordersData.hasNext}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Order Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (createOrderMutation.isPending) return; if (!open) resetCreateForm(); setShowCreate(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Source picker */}
            <div>
              <label className="text-sm font-medium block mb-2">Order Source</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { val: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, active: 'border-green-500 bg-green-50 text-green-700' },
                  { val: 'website',  label: 'Website',  icon: <Globe className="h-4 w-4" />,         active: 'border-blue-500 bg-blue-50 text-blue-700' },
                  { val: 'phone',    label: 'Phone',    icon: <Phone className="h-4 w-4" />,          active: 'border-amber-500 bg-amber-50 text-amber-700' },
                  { val: 'vayepar',  label: 'Vyapar',   icon: <Receipt className="h-4 w-4" />,        active: 'border-purple-500 bg-purple-50 text-purple-700' },
                  { val: 'b2b',      label: 'B2B',      icon: <Building2 className="h-4 w-4" />,      active: 'border-orange-500 bg-orange-50 text-orange-700' },
                ] as const).map(({ val, label, icon, active }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSource(val)}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                      source === val ? active : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/40'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Type */}
            <div>
              <label className="text-sm font-medium block mb-2">Order Type</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { val: 'b2b',         label: 'B2B',          icon: <Building2 className="h-4 w-4" />, active: 'border-orange-500 bg-orange-50 text-orange-700' },
                  { val: 'other_cities',label: 'Other Cities',  icon: <Globe className="h-4 w-4" />,    active: 'border-blue-500 bg-blue-50 text-blue-700' },
                  { val: 'transport',   label: 'Transport',     icon: <Truck className="h-4 w-4" />,    active: 'border-cyan-500 bg-cyan-50 text-cyan-700' },
                ] as const).map(({ val, label, icon, active }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOrderType(orderType === val ? '' : val)}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                      orderType === val ? active : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/40'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer details */}
            <div className="space-y-3">
              <label className="text-sm font-medium block">Customer Details</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
                  <Input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Phone Number *</label>
                  <Input
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Alternate Phone</label>
                  <Input
                    value={custAltPhone}
                    onChange={(e) => setCustAltPhone(e.target.value)}
                    placeholder="Optional alternate number"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
              </div>

<div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipping Address</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Street / House No. *</label>
                  <Input
                    value={addrStreet}
                    onChange={(e) => setAddrStreet(e.target.value)}
                    placeholder="e.g. 12, Nehru Nagar, Near Bus Stand"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Landmark</label>
                    <Input
                      value={addrLandmark}
                      onChange={(e) => setAddrLandmark(e.target.value)}
                      placeholder="e.g. Near temple"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">City *</label>
                    <Input
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      placeholder="e.g. Hinganghat"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                      placeholder="6-digit pincode (optional)"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Product search */}
            <div>
              <label className="text-sm font-medium block mb-1">Add Products</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onFocus={() => setProductDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
                  placeholder="Type to search products..."
                  className="pl-10"
                />
              </div>
              {productDropdownOpen && productSearch && (
                <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-white shadow-lg z-10">
                  {productSearchLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : productRows.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found</p>
                  ) : (
                    (() => {
                      const sorted = [...productRows].sort((a, b) => {
                        const aOut = a.trackStock && a.stock <= 0 ? 1 : 0;
                        const bOut = b.trackStock && b.stock <= 0 ? 1 : 0;
                        return aOut - bOut;
                      });
                      const firstOutIdx = sorted.findIndex((r) => r.trackStock && r.stock <= 0);
                      return sorted.map((row, idx) => {
                        const outOfStock = row.trackStock && row.stock <= 0;
                        const showDivider = firstOutIdx !== -1 && idx === firstOutIdx;
                        return (
                          <div key={`${row.productId}-${row.variantSku ?? 'main'}`}>
                            {showDivider && (
                              <div className="px-3 py-1 text-xs font-semibold text-gray-400 bg-gray-50 border-b uppercase tracking-wide">Out of Stock</div>
                            )}
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); addToCart(row); setProductSearch(''); }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left border-b last:border-b-0 ${outOfStock ? 'bg-gray-50 hover:bg-red-50' : 'hover:bg-green-50 bg-white'}`}
                            >
                              <span className="flex items-center gap-2">
                                {!outOfStock && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                                <span>
                                  {row.name}
                                  {row.variantName ? ` · ${row.variantName}` : ''}
                                  {row.variantSku ? ` (${row.variantSku})` : ''}
                                </span>
                              </span>
                              {outOfStock ? (
                                <span className="text-red-400 text-xs font-medium shrink-0 ml-2">Out of Stock</span>
                              ) : (
                                <span className="text-green-600 text-xs font-medium shrink-0 ml-2">
                                  ₹{row.price.toLocaleString()}{row.trackStock ? ` · ${row.stock} left` : ''}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              )}
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div className="border rounded-lg divide-y">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">₹{item.price.toLocaleString()} each</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setCart(cart.map((ci, i) => i === idx ? { ...ci, quantity: val } : ci));
                        }}
                        className="w-16 h-8 text-center"
                      />
                      <span className="text-sm font-medium w-20 text-right">
                        ₹{(item.price * item.quantity).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="space-y-1 px-3 py-2 bg-muted/30 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{cart.length} item{cart.length !== 1 ? 's' : ''} · Subtotal</span>
                    <span>₹{cartSubtotal.toLocaleString()}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount{discountIsPercent ? ` (${parseFloat(discount) || 0}%)` : ''}</span>
                      <span>-₹{discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base border-t pt-1">
                    <span>Total</span>
                    <span>₹{cartTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Discount */}
            {cart.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Discount</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Switch checked={discountIsPercent} onCheckedChange={setDiscountIsPercent} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max={discountIsPercent ? 100 : undefined}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    {discountIsPercent ? '%' : '₹'}
                  </span>
                </div>
              </div>
            )}

            {/* Reminder / Scheduled Date */}
            <div className="border rounded-lg p-3 space-y-2 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                <Bell className="h-4 w-4" />
                <span>Schedule Order <span className="font-normal text-amber-600">(optional)</span></span>
              </div>
              <p className="text-xs text-amber-600">Set a future date to hide this order until that day — it will appear automatically on the orders dashboard on the scheduled date.</p>
              <Input
                placeholder="Reminder message (e.g. Call customer)"
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
              />
              <Input
                type="datetime-local"
                value={reminderDueAt}
                onChange={(e) => setReminderDueAt(e.target.value)}
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="text-sm font-medium block mb-1">Payment Method</label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v as typeof paymentMethod); if (v !== 'upi') { setUpiProofFile(null); if (upiProofPreview) URL.revokeObjectURL(upiProofPreview); setUpiProofPreview(null); } }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cod">Cash on Delivery (COD)</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="netbanking">Net Banking</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* UPI payment proof */}
            {paymentMethod === 'upi' && (
              <div>
                <label className="text-sm font-medium block mb-1">UPI Payment Screenshot <span className="text-muted-foreground font-normal">(Optional)</span></label>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-muted-foreground/40 transition-colors"
                  onClick={() => document.getElementById('upi-proof-input')?.click()}
                >
                  {upiProofPreview ? (
                    <div className="relative">
                      <img src={upiProofPreview} alt="UPI proof" className="max-h-40 mx-auto rounded object-contain" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        onClick={(e) => { e.stopPropagation(); setUpiProofFile(null); if (upiProofPreview) URL.revokeObjectURL(upiProofPreview); setUpiProofPreview(null); }}
                      >✕</button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm py-4">
                      <p className="font-medium">Tap to upload screenshot</p>
                      <p className="text-xs mt-1">JPG, PNG supported</p>
                    </div>
                  )}
                </div>
                <input
                  id="upi-proof-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUpiProofFile(file);
                    setUpiProofPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return URL.createObjectURL(file);
                    });
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium block mb-1">Notes <span className="text-muted-foreground font-normal">(Optional)</span></label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions..."
                rows={2}
                className="resize-none"
              />
            </div>

            {createError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {createError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={createOrderMutation.isPending} onClick={() => { resetCreateForm(); setShowCreate(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => { setCreateError(''); createOrderMutation.mutate(); }}
              disabled={!canSubmit || createOrderMutation.isPending}
            >
              {createOrderMutation.isPending ? 'Creating...' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={editingOrder !== null} onOpenChange={(open) => { if (updateOrderMutation.isPending) return; if (!open) setEditingOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order {editingOrder?.orderNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Status options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Order Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="placed">Placed</option>
                  <option value="confirmed">Packed</option>
                  <option value="preparing">Preparing</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="returned">Returned</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Payment Status</label>
                <select
                  value={editPaymentStatus}
                  onChange={(e) => setEditPaymentStatus(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Payment Method</label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="cod">Cash on Delivery (COD)</option>
                  <option value="prepaid">Prepaid</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Customer Notes</label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes from customer..."
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Admin Notes</label>
                <Textarea
                  value={editAdminNotes}
                  onChange={(e) => setEditAdminNotes(e.target.value)}
                  placeholder="Internal notes..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Products */}
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Products</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={editProductSearch}
                  onChange={(e) => setEditProductSearch(e.target.value)}
                  onFocus={() => setEditProductDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setEditProductDropdownOpen(false), 150)}
                  placeholder="Search to add products..."
                  className="pl-10"
                />
              </div>
              {editProductDropdownOpen && editProductSearch && (
                <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-white shadow-lg z-10">
                  {editProductSearchLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : editProductRows.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found</p>
                  ) : (
                    editProductRows.map((row) => {
                      const outOfStock = row.trackStock && row.stock <= 0;
                      return (
                        <button
                          key={`${row.productId}-${row.variantSku ?? 'main'}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); addToEditCart(row); }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left border-b last:border-b-0 ${outOfStock ? 'bg-gray-50 hover:bg-red-50' : 'hover:bg-green-50 bg-white'}`}
                        >
                          <span>
                            {row.name}
                            {row.variantName ? ` · ${row.variantName}` : ''}
                          </span>
                          {outOfStock ? (
                            <span className="text-red-400 text-xs font-medium shrink-0 ml-2">Out of Stock</span>
                          ) : (
                            <span className="text-green-600 text-xs font-medium shrink-0 ml-2">₹{row.price.toLocaleString()}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              {editCart.length > 0 && (
                <div className="border rounded-md divide-y">
                  {editCart.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">₹{item.price.toLocaleString()} each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setEditCart(editCart.map((ci, i) => i === idx ? { ...ci, quantity: val } : ci));
                          }}
                          className="w-16 h-8 text-center"
                        />
                        <span className="text-sm font-medium w-20 text-right">₹{(item.price * item.quantity).toLocaleString()}</span>
                        <Button variant="ghost" size="sm" onClick={() => setEditCart(editCart.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const editSubtotal = editCart.reduce((s, i) => s + i.price * i.quantity, 0);
                    const editDiscountAmt = editDiscountIsPercent
                      ? editSubtotal * (Math.min(parseFloat(editDiscount) || 0, 100) / 100)
                      : (parseFloat(editDiscount) || 0);
                    const editShipping = parseFloat(editShippingCharge) || 0;
                    const editTotal = Math.max(0, editSubtotal - editDiscountAmt + editShipping);
                    return (
                      <div className="space-y-1 px-3 py-2 bg-muted/30 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <span>{editCart.length} item{editCart.length !== 1 ? 's' : ''} · Subtotal</span>
                          <span>₹{editSubtotal.toLocaleString()}</span>
                        </div>
                        {editDiscountAmt > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Discount{editDiscountIsPercent ? ` (${parseFloat(editDiscount) || 0}%)` : ''}</span>
                            <span>-₹{editDiscountAmt.toLocaleString()}</span>
                          </div>
                        )}
                        {editShipping > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Shipping</span>
                            <span>+₹{editShipping.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold border-t pt-1">
                          <span>Total</span>
                          <span>₹{editTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Shipping Charge + Discount */}
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Shipping Charge</label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={editShippingCharge}
                    onChange={(e) => setEditShippingCharge(e.target.value)}
                    placeholder="0"
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₹</span>
                </div>
              </div>
              {/* Discount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Discount</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Switch checked={editDiscountIsPercent} onCheckedChange={setEditDiscountIsPercent} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max={editDiscountIsPercent ? 100 : undefined}
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    placeholder="0"
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    {editDiscountIsPercent ? '%' : '₹'}
                  </span>
                </div>
              </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipping Address</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
                  <Input
                    value={editShipName}
                    onChange={(e) => setEditShipName(e.target.value)}
                    placeholder="Recipient Name"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Phone Number *</label>
                  <Input
                    value={editShipPhone}
                    onChange={(e) => setEditShipPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Street / House No. *</label>
                <Input
                  value={editShipStreet}
                  onChange={(e) => setEditShipStreet(e.target.value)}
                  placeholder="Street details"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Landmark</label>
                  <Input
                    value={editShipLandmark}
                    onChange={(e) => setEditShipLandmark(e.target.value)}
                    placeholder="Landmark"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">City *</label>
                  <Input
                    value={editShipCity}
                    onChange={(e) => setEditShipCity(e.target.value)}
                    placeholder="City"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">State *</label>
                  <Input
                    value={editShipState}
                    onChange={(e) => setEditShipState(e.target.value)}
                    placeholder="State"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Pincode *</label>
                  <Input
                    value={editShipPincode}
                    onChange={(e) => setEditShipPincode(e.target.value)}
                    placeholder="6-digit pincode"
                    maxLength={6}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            {editError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {editError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={updateOrderMutation.isPending} onClick={() => setEditingOrder(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={
                !editShipName.trim() ||
                editShipPhone.trim().length < 10 ||
                !editShipStreet.trim() ||
                !editShipCity.trim() ||
                !editShipState.trim() ||
                (editShipPincode.trim().length > 0 && editShipPincode.trim().length !== 6) ||
                editCart.length === 0 ||
                updateOrderMutation.isPending
              }
            >
              {updateOrderMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deletingOrder} onOpenChange={(open) => { if (deleteOrderMutation.isPending) return; if (!open) setDeletingOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently delete order <span className="font-medium text-foreground">{deletingOrder?.orderNumber}</span> for{' '}
            <span className="font-medium text-foreground">{deletingOrder?.shippingAddress?.name}</span>?
            <br /><br />
            This cannot be undone. Revenue stats will update automatically.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingOrder(null)} disabled={deleteOrderMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteOrderMutation.isPending}
              onClick={() => deletingOrder && deleteOrderMutation.mutate(deletingOrder._id)}
            >
              {deleteOrderMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
