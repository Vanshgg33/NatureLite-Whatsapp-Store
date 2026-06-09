'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, Plus, Trash2, ShoppingCart, MessageCircle, Globe, Download, Send, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, useDebouncedValue } from '@/lib/utils';
import { captureInvoicePdf, billFilename, base64ToBlob } from '@/lib/bill-pdf';
import { useToast } from '@/components/ui/use-toast';
import { OrderStatus, Product, Order } from '@/types';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'placed', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
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
};

function flattenProductRows(products: Product[]): ProductRow[] {
  const rows: ProductRow[] = [];
  for (const p of products) {
    const activeVariants = (p.variants ?? []).filter((v) => v.isActive);
    if (activeVariants.length > 0) {
      for (const v of activeVariants) {
        rows.push({ productId: p._id, name: p.name, variantSku: v.sku, variantName: v.name, price: v.price });
      }
    } else {
      rows.push({ productId: p._id, name: p.name, price: p.price });
    }
  }
  return rows;
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // List state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);

  // Create order dialog
  const [showCreate, setShowCreate] = useState(false);
  const [source, setSource] = useState<'whatsapp' | 'website'>('whatsapp');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('Maharashtra');
  const [addrPincode, setAddrPincode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi' | 'card' | 'netbanking'>('cod');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [createError, setCreateError] = useState('');

  const { data: ordersData, isLoading, isFetching } = useQuery({
    queryKey: ['orders', page, debouncedSearch, status],
    queryFn: () => api.getOrders({ page, limit: 20, search: debouncedSearch, status: (status || undefined) as OrderStatus | undefined, sortBy: 'updatedAt', sortOrder: 'desc' }),
    placeholderData: (prev) => prev,
  });

  const { data: productSearchResults = [] } = useQuery({
    queryKey: ['product-search', debouncedProductSearch],
    queryFn: () => api.searchProducts(debouncedProductSearch, 20),
    enabled: !!debouncedProductSearch && showCreate,
  });
  const productRows = flattenProductRows(productSearchResults as Product[]);

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.createGuestOrder({
        items: cart.map((i) => ({ productId: i.productId, variantSku: i.variantSku, quantity: i.quantity })),
        shippingAddress: {
          name: custName.trim(),
          phone: custPhone.trim(),
          street: addrStreet.trim(),
          landmark: addrLandmark.trim() || undefined,
          city: addrCity.trim(),
          state: addrState.trim(),
          pincode: addrPincode.trim(),
        },
        paymentMethod,
        phone: custPhone.trim(),
        name: custName.trim(),
        notes: notes.trim()
          ? `[${source === 'whatsapp' ? 'WhatsApp' : 'Website'}] ${notes.trim()}`
          : `[${source === 'whatsapp' ? 'WhatsApp' : 'Website'}] Order created by admin`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      resetCreateForm();
      setShowCreate(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create order';
      setCreateError(msg);
    },
  });

  function resetCreateForm() {
    setSource('whatsapp');
    setCustName('');
    setCustPhone('');
    setAddrStreet('');
    setAddrLandmark('');
    setAddrCity('');
    setAddrState('Maharashtra');
    setAddrPincode('');
    setPaymentMethod('cod');
    setNotes('');
    setCart([]);
    setProductSearch('');
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
      a.download = billFilename(order.shippingAddress.name);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Failed to generate PDF', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBillLoadingId(null);
    }
  }

  async function handleSendBill(order: Order) {
    setSendLoadingId(order._id);
    try {
      const b64 = await captureInvoicePdf(`/invoice/${order._id}`, order._id);
      await api.uploadOrderInvoice(order._id, b64, billFilename(order.shippingAddress.name));
      await api.sendOrderInvoice(order._id);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Invoice sent!', description: `Bill for ${order.orderNumber} sent to customer via WhatsApp.` });
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : 'Please try again.');
      toast({ title: 'Failed to send invoice', description: msg, variant: 'destructive' });
    } finally {
      setSendLoadingId(null);
    }
  }

  function addToCart(row: ProductRow) {
    const existing = cart.find(
      (i) => i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? ''),
    );
    if (existing) {
      setCart(cart.map((i) =>
        i.productId === row.productId && (i.variantSku ?? '') === (row.variantSku ?? '')
          ? { ...i, quantity: i.quantity + 1 }
          : i,
      ));
    } else {
      setCart([...cart, {
        productId: row.productId,
        variantSku: row.variantSku,
        name: row.variantName ? `${row.name} · ${row.variantName}` : row.name,
        price: row.price,
        quantity: 1,
      }]);
    }
    setProductSearch('');
  }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const canSubmit =
    custName.trim() &&
    custPhone.trim().length >= 10 &&
    addrStreet.trim() &&
    addrCity.trim() &&
    addrPincode.trim().length === 6 &&
    cart.length > 0;

  return (
    <div>
      <Header title="Orders" description="Manage customer orders" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Top bar with Create Order button */}
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Order
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:px-6 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              <div className="relative flex-1 min-w-0 max-w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search by order # or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                  {search || status ? 'Try adjusting your filters.' : 'Orders will appear here once customers start purchasing.'}
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
                              <p className="font-medium leading-tight">{order.shippingAddress.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                                {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{order.orderNumber}</p>
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
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(order.createdAt)}
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
                                title={order.shippingAddress?.phone ? 'Send bill to customer via WhatsApp' : 'No phone on order'}
                                disabled={sendLoadingId === order._id || !order.shippingAddress?.phone}
                                onClick={() => handleSendBill(order)}
                              >
                                {sendLoadingId === order._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetCreateForm(); setShowCreate(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Source picker */}
            <div>
              <label className="text-sm font-medium block mb-2">Order Source</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSource('whatsapp')}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                    source === 'whatsapp'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/40'
                  }`}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setSource('website')}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                    source === 'website'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/40'
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  Website
                </button>
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
                    <label className="text-xs text-muted-foreground mb-1 block">Pincode *</label>
                    <Input
                      value={addrPincode}
                      onChange={(e) => setAddrPincode(e.target.value)}
                      placeholder="6-digit pincode"
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
                  {productRows.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found</p>
                  ) : (
                    productRows.map((row) => (
                      <button
                        key={`${row.productId}-${row.variantSku ?? 'main'}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); addToCart(row); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 text-sm text-left border-b last:border-b-0"
                      >
                        <span>
                          {row.name}
                          {row.variantName ? ` · ${row.variantName}` : ''}
                          {row.variantSku ? ` (${row.variantSku})` : ''}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          ₹{row.price.toLocaleString()}
                        </span>
                      </button>
                    ))
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
                <div className="flex justify-between items-center px-3 py-2 bg-muted/30">
                  <span className="text-sm text-muted-foreground">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-base">₹{cartTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Payment method */}
            <div>
              <label className="text-sm font-medium block mb-1">Payment Method</label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
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
            <Button variant="outline" onClick={() => { resetCreateForm(); setShowCreate(false); }}>
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
    </div>
  );
}
