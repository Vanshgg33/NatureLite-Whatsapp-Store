'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
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
import { useState } from 'react';
import { Order } from '@/types';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', params.id],
    queryFn: () => api.getUser(params.id as string),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['customer-orders', params.id],
    queryFn: () => api.getOrders({ search: customer?.phone, limit: 50 }),
    enabled: !!customer?.phone,
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

  const orders = ordersData?.items || [];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      processing: 'bg-purple-100 text-purple-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {customer.name || 'Customer'}
          </h1>
          <p className="text-muted-foreground">Customer details and order history</p>
        </div>
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
                  ₹{customer.totalSpent.toLocaleString()}
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
              {customer.addresses.length} address{customer.addresses.length !== 1 ? 'es' : ''} saved
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customer.addresses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="mx-auto h-8 w-8 mb-2" />
                <p>No addresses saved</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {customer.addresses.map((address, index) => (
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
                    onClick={() => router.push(`/orders/${order._id}`)}
                  >
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{order.items.length} items</TableCell>
                    <TableCell>₹{order.total.toLocaleString()}</TableCell>
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
  );
}
