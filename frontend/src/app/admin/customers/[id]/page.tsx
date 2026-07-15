'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  Ban,
  CheckCircle,
  Package,
  TrendingUp,
  Star,
  Clock,
  Wallet as WalletIcon,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { formatCurrency, getStatusColor } from '@/lib/utils';
import { Order } from '@/types';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [walletAmountInput, setWalletAmountInput] = useState('');
  const [walletNoteInput, setWalletNoteInput] = useState('');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', params.id],
    queryFn: () => api.getUser(params.id as string),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['customer-orders', params.id],
    queryFn: () => api.getOrders({ userId: params.id as string, limit: 50, page: 1 }),
    enabled: !!params.id,
  });

  const { data: walletSummary } = useQuery({
    queryKey: ['customer-wallet', params.id],
    queryFn: () => api.adminGetWallet(params.id as string),
  });

  const blockMutation = useMutation({
    mutationFn: () => api.blockUser(params.id as string, blockReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', params.id] });
      setBlockDialogOpen(false);
      setBlockReason('');
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.unblockUser(params.id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', params.id] });
    },
  });

  const creditWalletMutation = useMutation({
    mutationFn: () =>
      api.adminCreditWallet(
        params.id as string,
        Math.round(Number(walletAmountInput || 0)),
        walletNoteInput || undefined,
      ),
    onSuccess: () => {
      setWalletAmountInput('');
      setWalletNoteInput('');
      queryClient.invalidateQueries({ queryKey: ['customer-wallet', params.id] });
    },
  });

  const debitWalletMutation = useMutation({
    mutationFn: () =>
      api.adminDebitWallet(
        params.id as string,
        Math.round(Number(walletAmountInput || 0)),
        walletNoteInput || undefined,
      ),
    onSuccess: () => {
      setWalletAmountInput('');
      setWalletNoteInput('');
      queryClient.invalidateQueries({ queryKey: ['customer-wallet', params.id] });
    },
  });

  const orders = ordersData?.items || [];

  const {
    avgOrderValue,
    lastOrderDate,
    ordersLast30Days,
    ordersLast60Days,
    ordersLast90Days,
    mostBoughtItems,
  } = useMemo(() => {
    const now = new Date();
    const day30 = new Date(now);
    day30.setDate(day30.getDate() - 30);
    const day60 = new Date(now);
    day60.setDate(day60.getDate() - 60);
    const day90 = new Date(now);
    day90.setDate(day90.getDate() - 90);

    const totalOrders = customer?.totalOrders ?? 0;
    const totalSpent = customer?.totalSpent ?? 0;
    const avg = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const last = orders.length > 0 ? new Date(orders[0].createdAt) : null;

    let last30 = 0,
      last60 = 0,
      last90 = 0;
    const productCount: Record<string, { name: string; quantity: number }> = {};
    orders.forEach((o: Order) => {
      const d = new Date(o.createdAt);
      if (d >= day30) last30++;
      if (d >= day60) last60++;
      if (d >= day90) last90++;
      (o.items || []).forEach((item) => {
        const product = item.product as { name?: string } | undefined;
        const name = item.name || product?.name || 'Unknown';
        if (!productCount[name]) productCount[name] = { name, quantity: 0 };
        productCount[name].quantity += item.quantity || 0;
      });
    });
    const mostBought = Object.values(productCount)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return {
      avgOrderValue: avg,
      lastOrderDate: last,
      ordersLast30Days: last30,
      ordersLast60Days: last60,
      ordersLast90Days: last90,
      mostBoughtItems: mostBought,
    };
  }, [customer?.totalOrders, customer?.totalSpent, orders]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Customer not found</h2>
        <Button onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={customer.name || 'Customer'}
        description="Customer dashboard — details, orders, and insights"
      />
      <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1" />
        {customer.isBlocked ? (
          <Button onClick={() => unblockMutation.mutate()} disabled={unblockMutation.isPending}>
            <CheckCircle className="mr-2 h-4 w-4" />
            {unblockMutation.isPending ? 'Unblocking...' : 'Unblock Customer'}
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setBlockDialogOpen(true)}>
            <Ban className="mr-2 h-4 w-4" />
            Block Customer
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Customer Info Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-medium text-primary">
                  {customer.name?.[0]?.toUpperCase() || customer.phone[0]}
                </span>
              </div>
              <div>
                <p className="font-semibold">{customer.name || 'No name'}</p>
                <div className="flex gap-2 mt-1">
                  {customer.isBlocked ? (
                    <Badge variant="destructive">Blocked</Badge>
                  ) : customer.isActive ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Joined {new Date(customer.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{customer.totalOrders}</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Orders</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">
                  {formatCurrency(customer.totalSpent)}
                </span>
                <p className="text-xs text-muted-foreground">Total Spent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Addresses Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Saved Addresses</CardTitle>
            <CardDescription>
              {(customer.addresses ?? []).length} address{(customer.addresses ?? []).length !== 1 ? 'es' : ''} saved
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(customer.addresses ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="mx-auto h-8 w-8 mb-2" />
                <p>No addresses saved</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {(customer.addresses ?? []).map((address, index) => (
                  <div
                    key={index}
                    className="p-4 border rounded-lg relative"
                  >
                    {address.isDefault && (
                      <Badge className="absolute top-2 right-2" variant="secondary">
                        Default
                      </Badge>
                    )}
                    <p className="font-medium">{address.label}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {address.street}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {address.city}, {address.state} - {address.pincode}
                    </p>
                    {address.landmark && (
                      <p className="text-sm text-muted-foreground">
                        Landmark: {address.landmark}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats: Avg order value, Last order, Frequency */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Avg Order Value</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Last Order</span>
            </div>
            <p className="text-2xl font-bold">
              {lastOrderDate ? lastOrderDate.toLocaleDateString() : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ShoppingBag className="h-4 w-4" />
              <span className="text-sm font-medium">Orders (30 / 60 / 90 days)</span>
            </div>
            <p className="text-2xl font-bold">
              {ordersLast30Days} / {ordersLast60Days} / {ordersLast90Days}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              <span className="text-sm font-medium">Total Orders</span>
            </div>
            <p className="text-2xl font-bold">{customer.totalOrders}</p>
          </CardContent>
        </Card>
      </div>

      {/* Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5" />
            Wallet
          </CardTitle>
          <CardDescription>
            Store credits for this customer (used at checkout).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current balance</p>
              <p className="text-2xl font-bold">
                ₹{(walletSummary?.balance ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="flex-1 space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={walletAmountInput}
                onChange={(e) => setWalletAmountInput(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={walletNoteInput}
                onChange={(e) => setWalletNoteInput(e.target.value)}
                placeholder="Reason, e.g. refund for order #1234"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={
                  !walletAmountInput ||
                  Number(walletAmountInput) <= 0 ||
                  creditWalletMutation.isPending
                }
                onClick={() => creditWalletMutation.mutate()}
              >
                {creditWalletMutation.isPending ? 'Crediting...' : 'Credit'}
              </Button>
              <Button
                variant="destructive"
                disabled={
                  !walletAmountInput ||
                  Number(walletAmountInput) <= 0 ||
                  debitWalletMutation.isPending
                }
                onClick={() => debitWalletMutation.mutate()}
              >
                {debitWalletMutation.isPending ? 'Debiting...' : 'Debit'}
              </Button>
            </div>
          </div>
          {walletSummary?.transactions && walletSummary.transactions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">Recent wallet activity</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {walletSummary.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-xs border rounded-md px-3 py-2"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium capitalize">
                        {tx.reason.replace(/_/g, ' ')}
                      </p>
                      <p className="text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          tx.type === 'credit' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'
                        }
                      >
                        {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                      </p>
                      {tx.orderId && (
                        <p className="text-muted-foreground">
                          Order #{tx.orderId.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Most Bought Items */}
      {mostBoughtItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Most Bought Items
            </CardTitle>
            <CardDescription>Top products by quantity ordered</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {mostBoughtItems.map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <span className="text-sm font-medium truncate" title={item.name}>
                    {index + 1}. {item.name}
                  </span>
                  <Badge variant="secondary">{item.quantity} bought</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            All orders placed by this customer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-8 w-8 mb-2" />
              <p>No orders yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: Order) => (
                  <TableRow
                    key={order._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/orders/${order._id}`)}
                  >
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{order.items.length} items</TableCell>
                    <TableCell>₹{(order.total ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.paymentStatus === 'paid' ? 'default' : 'secondary'
                        }
                      >
                        {order.paymentStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Customer</DialogTitle>
            <DialogDescription>
              This will prevent the customer from placing new orders. They will be
              notified via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for blocking</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Enter the reason for blocking this customer..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => blockMutation.mutate()}
              disabled={!blockReason.trim() || blockMutation.isPending}
            >
              {blockMutation.isPending ? 'Blocking...' : 'Block Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
