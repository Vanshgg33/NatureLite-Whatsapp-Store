'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Package, Tag, X, CheckSquare } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCurrency, getProductTotalStock } from '@/lib/utils';
import { Product, Category } from '@/types';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const queryClient = useQueryClient();

  const { data: rawData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => api.getProducts({ page, limit: 20, search }),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories({ limit: 100 }),
  });

  const categoryList: Category[] = Array.isArray(categories)
    ? categories
    : Array.isArray((categories as { items?: Category[] })?.items)
      ? (categories as { items: Category[] }).items
      : [];

  const raw = rawData as { items?: Product[]; data?: Product[] } | undefined;
  const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.data) ? raw.data : [];
  const data = rawData
    ? {
        ...rawData,
        items,
        total: typeof rawData.total === 'number' ? rawData.total : items.length,
        totalPages: typeof rawData.totalPages === 'number' ? rawData.totalPages : Math.max(1, Math.ceil((rawData.total ?? items.length) / (rawData.limit ?? 20))),
        hasPrevious: rawData.hasPrevious ?? page > 1,
        hasNext: rawData.hasNext ?? items.length === (rawData.limit ?? 20),
      }
    : undefined;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
    },
  });

  const bulkCategoryMutation = useMutation({
    mutationFn: ({ productIds, categoryId }: { productIds: string[]; categoryId: string }) =>
      api.bulkUpdateProductCategory(productIds, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
      setBulkCategoryId('');
    },
  });

  const handleDelete = (product: Product) => {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      deleteMutation.mutate(product._id);
    }
  };

  const handleBulkCategory = () => {
    if (!bulkCategoryId || selected.size === 0) return;
    bulkCategoryMutation.mutate({ productIds: Array.from(selected), categoryId: bulkCategoryId });
  };

  const allIds = items.map((p) => p._id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set(Array.from(prev).concat(allIds)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div>
      <Header
        title="Products"
        description="Manage your product catalog"
        action={
          <Link href="/admin/products/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
            <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-primary">
              {selected.size} product{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="text-sm border rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Change category…</option>
                {categoryList.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!bulkCategoryId || bulkCategoryMutation.isPending}
                onClick={handleBulkCategory}
              >
                {bulkCategoryMutation.isPending ? 'Updating…' : 'Apply'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-destructive/10 p-4 mb-4">
                  <Package className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-sm font-medium">Unable to load products</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  {error instanceof Error ? error.message : 'Check your connection and that the API is running.'}
                </p>
                <Button variant="outline" onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            ) : data?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted/50 p-4 mb-4">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No products found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {search ? 'Try a different search term.' : 'Get started by adding your first product.'}
                </p>
                <Link href="/admin/products/new" className="mt-4">
                  <Button>Add Product</Button>
                </Link>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={toggleAll}
                          className="cursor-pointer accent-primary"
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((product) => {
                      const totalStock = getProductTotalStock(product);
                      const isChecked = selected.has(product._id);
                      return (
                        <TableRow
                          key={product._id}
                          className={isChecked ? 'bg-primary/5' : undefined}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleOne(product._id)}
                              className="cursor-pointer accent-primary"
                              aria-label={`Select ${product.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            {product.images?.[0] ? (
                              <Image
                                src={product.images?.[0] as string}
                                alt={product.name}
                                width={40}
                                height={40}
                                className="rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-gray-100" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {product.category && typeof product.category === 'object'
                                  ? product.category.name
                                  : 'Uncategorized'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{formatCurrency(product.price)}</p>
                              {product.compareAtPrice && (
                                <p className="text-xs text-muted-foreground line-through">
                                  {formatCurrency(product.compareAtPrice)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={totalStock > 0 ? 'default' : 'destructive'}
                              className={
                                totalStock > product.lowStockThreshold
                                  ? 'bg-green-100 text-green-800'
                                  : totalStock > 0
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : ''
                              }
                            >
                              {totalStock}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={product.isActive ? 'default' : 'secondary'}>
                              {product.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/admin/products/${product._id}`}>
                                <Button variant="ghost" size="icon" aria-label="Edit product">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete product"
                                onClick={() => handleDelete(product)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.total)} of{' '}
                      {data.total} products
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
