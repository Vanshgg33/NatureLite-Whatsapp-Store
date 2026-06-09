'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Ban, CheckCircle, Eye, Users } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, useDebouncedValue } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { User } from '@/types';

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [blockDialogUser, setBlockDialogUser] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', page, debouncedSearch],
    queryFn: () => api.getUsers({ page, limit: 20, search: debouncedSearch }),
    placeholderData: (prev) => prev,
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.blockUser(id, reason),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['customers'] });
      const queryKey = ['customers', page, debouncedSearch];
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return { ...old, items: old.items.map((u: User) => u._id === id ? { ...u, isBlocked: true } : u) };
      });
      return { snapshot, queryKey };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.snapshot) queryClient.setQueryData(context.queryKey, context.snapshot);
      toast({ title: 'Failed to block customer', variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'Customer blocked' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => api.unblockUser(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['customers'] });
      const queryKey = ['customers', page, debouncedSearch];
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return { ...old, items: old.items.map((u: User) => u._id === id ? { ...u, isBlocked: false } : u) };
      });
      return { snapshot, queryKey };
    },
    onError: (_err, _id, context: any) => {
      if (context?.snapshot) queryClient.setQueryData(context.queryKey, context.snapshot);
      toast({ title: 'Failed to unblock customer', variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'Customer unblocked' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const handleBlock = (user: User) => {
    setBlockReason('');
    setBlockDialogUser(user);
  };

  const handleUnblock = (user: User) => {
    unblockMutation.mutate(user._id);
  };

  return (
    <div>
      <Header title="Customers" description="Manage your customer base" />

      <div className="p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
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
            ) : data?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted/50 p-4 mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No customers found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {search ? 'Try a different search term.' : 'Customers will appear here once they register.'}
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Total Spent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((user) => (
                      <TableRow key={user._id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {user.name?.[0]?.toUpperCase() || user.phone[0]}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{user.name || 'Unnamed'}</p>
                              <p className="text-xs text-muted-foreground">{user.email || '-'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell>{user.totalOrders}</TableCell>
                        <TableCell>{formatCurrency(user.totalSpent)}</TableCell>
                        <TableCell>
                          {user.isBlocked ? (
                            <Badge variant="destructive">Blocked</Badge>
                          ) : user.isActive ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/admin/customers/${user._id}`)}
                              title="View Details"
                              aria-label="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {user.isBlocked ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUnblock(user)}
                                title="Unblock"
                                aria-label="Unblock user"
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleBlock(user)}
                                title="Block"
                                aria-label="Block user"
                              >
                                <Ban className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.total)} of{' '}
                      {data.total} customers
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

      {/* Block customer dialog */}
      <Dialog open={!!blockDialogUser} onOpenChange={(open) => { if (!open) setBlockDialogUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block {blockDialogUser?.name || blockDialogUser?.phone}</DialogTitle>
            <DialogDescription>Provide a reason for blocking this customer.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Label htmlFor="blockReason">Reason</Label>
            <Input
              id="blockReason"
              className="mt-2"
              placeholder="e.g. Multiple payment failures"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && blockReason.trim() && blockDialogUser) {
                  blockMutation.mutate({ id: blockDialogUser._id, reason: blockReason.trim() });
                  setBlockDialogUser(null);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!blockReason.trim() || blockMutation.isPending}
              onClick={() => {
                if (blockDialogUser && blockReason.trim()) {
                  blockMutation.mutate({ id: blockDialogUser._id, reason: blockReason.trim() });
                  setBlockDialogUser(null);
                }
              }}
            >
              Block Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
