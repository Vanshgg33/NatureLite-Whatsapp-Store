'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Warehouse, Search, AlertTriangle, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { getStoreItemTotalStock } from '@/lib/utils';
import type { Store, StoreStockItem } from '@/types';

export default function StoreStockPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editItem, setEditItem] = useState<StoreStockItem | null>(null);
  const [editStock, setEditStock] = useState('');
  const [editThreshold, setEditThreshold] = useState('');

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
  });

  // Auto-select first store for superadmin
  useEffect(() => {
    if (!selectedStoreId && stores.length > 0 && isSuperadmin) {
      setSelectedStoreId(stores[0]._id);
    }
  }, [stores, selectedStoreId, isSuperadmin]);

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['store-stock', selectedStoreId, page, search, lowStockOnly],
    queryFn: () =>
      api.getStoreStock(selectedStoreId, { page, limit: 20, search, lowStockOnly }),
    enabled: !!selectedStoreId,
  });

  const updateStockMutation = useMutation({
    mutationFn: (data: { storeId: string; productId: string; stock: number; lowStockThreshold?: number }) =>
      api.setStoreStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      setEditItem(null);
    },
  });

  const selectedStore = stores.find((s) => s._id === selectedStoreId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-gray-500 mt-1">
            Manage inventory for {selectedStore?.name || 'your store'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {isSuperadmin && (
              <div className="w-48">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Store</label>
                <Select value={selectedStoreId} onValueChange={(v) => { setSelectedStoreId(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.filter((s) => s._id).map((store) => (
                      <SelectItem key={store._id} value={store._id}>
                        {store.name} {store.isMainStore ? '(Main)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by product name or SKU..."
                  className="pl-10"
                />
              </div>
            </div>
            <Button
              variant={lowStockOnly ? 'default' : 'outline'}
              onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Low Stock Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Warehouse className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Select a store to view stock</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Product</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">SKU</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Category</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Stock</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Threshold</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
                    <th className="text-right p-4 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stockData?.items?.map((item: StoreStockItem) => {
                    const totalStock = getStoreItemTotalStock(item);
                    const isLow = totalStock <= item.lowStockThreshold;
                    const isOut = totalStock <= 0;
                    return (
                      <tr key={item._id} className="border-b hover:bg-gray-50/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {item.productImages?.[0] ? (
                              <img
                                src={item.productImages?.[0] as string}
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Package className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                            <span className="font-medium text-sm">{item.productName}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-mono text-gray-600">{item.productSku}</td>
                        <td className="p-4 text-sm text-gray-600">{item.categoryName || '-'}</td>
                        <td className="p-4 text-sm font-medium">
                          ₹{item.productPrice?.toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className={`text-sm font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-600'}`}>
                            {totalStock}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-500">{item.lowStockThreshold}</td>
                        <td className="p-4">
                          {isOut ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : isLow ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">Low Stock</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">In Stock</Badge>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditItem(item);
                              setEditStock(item.stock.toString());
                              setEditThreshold(item.lowStockThreshold.toString());
                            }}
                          >
                            Update
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!stockData?.items || stockData.items.length === 0) && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        {search ? 'No products found matching your search' : 'No stock records found. Add stock for products to see them here.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {stockData && stockData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-gray-500">
                  Page {stockData.page} of {stockData.totalPages} ({stockData.total} items)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!stockData.hasPrevious}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!stockData.hasNext}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Stock Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Stock - {editItem?.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Stock Quantity</label>
              <Input
                type="number"
                min="0"
                value={editStock}
                onChange={(e) => setEditStock(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Low Stock Threshold</label>
              <Input
                type="number"
                min="0"
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editItem) return;
                updateStockMutation.mutate({
                  storeId: selectedStoreId,
                  productId: typeof editItem.product === 'string' ? editItem.product : (editItem.product as any)._id,
                  stock: parseInt(editStock),
                  lowStockThreshold: parseInt(editThreshold),
                });
              }}
              disabled={updateStockMutation.isPending}
            >
              {updateStockMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
