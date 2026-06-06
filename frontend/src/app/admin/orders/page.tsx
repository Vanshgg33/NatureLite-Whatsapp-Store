'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Eye, ChevronDown, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, useDebouncedValue } from '@/lib/utils';
import { OrderStatus } from '@/types';

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

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, debouncedSearch, status],
    queryFn: () => api.getOrders({ page, limit: 20, search: debouncedSearch, status: (status || undefined) as OrderStatus | undefined }),
  });

  return (
    <div>
      <Header title="Orders" description="Manage customer orders" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : data?.items.length === 0 ? (
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
                    {data?.items.map((order) => (
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
                          <Link href={`/admin/orders/${order._id}`}>
                            <Button variant="ghost" size="icon" aria-label="View order">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>

                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.total)} of{' '}
                      {data.total} orders
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={!data.hasPrevious}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!data.hasNext}
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
    </div>
  );
}
