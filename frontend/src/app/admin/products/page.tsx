'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Package, Tag, X, CheckSquare, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { formatCurrency, getProductTotalStock, useDebouncedValue } from '@/lib/utils';
import { Product, Category } from '@/types';

type SortField = 'name' | 'sku' | 'price' | 'stock' | 'isActive' | 'createdAt';
type SortDir = 'asc' | 'desc';

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-30 inline" />;
  return dir === 'asc'
    ? <ArrowUp className="ml-1 h-3.5 w-3.5 inline text-primary" />
    : <ArrowDown className="ml-1 h-3.5 w-3.5 inline text-primary" />;
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: rawData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['products', page, debouncedSearch, filterCategory, sortBy, sortDir],
    queryFn: () => api.getProducts({ page, limit: 20, search: debouncedSearch, category: filterCategory || undefined, sortBy, sortOrder: sortDir }),
    placeholderData: (prev) => prev,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories({ limit: 100 }),
    staleTime: 10 * 60 * 1000,
  });

  const categoryList = useMemo<Category[]>(() => {
    if (Array.isArray(categories)) return categories as Category[];
    const items = (categories as { items?: Category[] })?.items;
    return Array.isArray(items) ? items : [];
  }, [categories]);

  const data = useMemo(() => {
    if (!rawData) return undefined;
    const raw = rawData as { items?: Product[]; data?: Product[] };
    const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.data) ? raw.data : [];
    return {
      ...rawData,
      items,
      total: typeof rawData.total === 'number' ? rawData.total : items.length,
      totalPages: typeof rawData.totalPages === 'number' ? rawData.totalPages : Math.max(1, Math.ceil((rawData.total ?? items.length) / (rawData.limit ?? 20))),
      hasPrevious: rawData.hasPrevious ?? page > 1,
      hasNext: rawData.hasNext ?? items.length === (rawData.limit ?? 20),
    };
  }, [rawData, page]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });
      const queryKey = ['products', page, debouncedSearch, filterCategory, sortBy, sortDir];
      const snapshot = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return { ...old, items: (old.items as Product[]).filter((p) => p._id !== id), total: Math.max(0, (old.total ?? 0) - 1) };
      });
      return { snapshot, queryKey };
    },
    onError: (_err, _id, context: any) => {
      if (context?.snapshot) queryClient.setQueryData(context.queryKey, context.snapshot);
      toast({ title: 'Failed to delete product', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
    },
  });

  const bulkCategoryMutation = useMutation({
    mutationFn: ({ productIds, categoryId }: { productIds: string[]; categoryId: string }) =>
      api.bulkUpdateProductCategory(productIds, categoryId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
      setBulkCategoryId('');
      toast({ title: `Category updated for ${data.modifiedCount} product(s).` });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to update category', description: getApiError(err, 'Please try again.'), variant: 'destructive' });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteProducts(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(new Set());
      toast({ title: `Deleted ${data.deletedCount} product(s).` });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to delete products', description: getApiError(err, 'Please try again.'), variant: 'destructive' });
    },
  });

  const handleDelete = (product: Product) => setDeleteConfirmProduct(product);

  const handleBulkCategory = () => {
    if (!bulkCategoryId || selected.size === 0) return;
    bulkCategoryMutation.mutate({ productIds: Array.from(selected), categoryId: bulkCategoryId });
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await api.exportProductsCsv(filterCategory || undefined);
      const catName = categoryList.find((c) => c._id === filterCategory)?.name;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = catName ? `products-${catName.toLowerCase().replace(/\s+/g, '-')}.csv` : 'products.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const items = data?.items ?? [];
  const allIds = useMemo(() => items.map((p) => p._id), [items]);
  const allSelected = useMemo(() => allIds.length > 0 && allIds.every((id) => selected.has(id)), [allIds, selected]);
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); allIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => new Set(Array.from(prev).concat(allIds)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const thClass = 'cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap';

  return (
    <div>
      <Header
        title="Products"
        description="Manage your product catalog"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Link href="/admin/products/import">
              <Button variant="outline" size="sm">
                <Upload className="mr-1.5 h-4 w-4" /> Import CSV
              </Button>
            </Link>
            <Link href="/admin/products/new">
              <Button><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
            </Link>
          </div>
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
              <Button size="sm" disabled={!bulkCategoryId || bulkCategoryMutation.isPending} onClick={handleBulkCategory}>
                {bulkCategoryMutation.isPending ? 'Updating…' : 'Apply'}
              </Button>
              <span className="w-px h-6 bg-border mx-1" />
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDeleteMutation.isPending}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="h-4 w-4" />
                {bulkDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                className="text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
              >
                <option value="">All categories</option>
                {categoryList.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
              {filterCategory && (
                <button
                  type="button"
                  onClick={() => { setFilterCategory(''); setPage(1); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Clear filter
                </button>
              )}
            </div>

            {isFetching && !isLoading && (
              <div className="h-0.5 w-full bg-primary/20 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-primary animate-pulse w-1/2 rounded-full" />
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-destructive/10 p-4 mb-4">
                  <Package className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-sm font-medium">Unable to load products</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  {getApiError(error, 'Check your connection.')}
                </p>
                <Button variant="outline" onClick={() => refetch()}>Try again</Button>
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
                      <TableHead className="w-12" />
                      <TableHead className={thClass} onClick={() => toggleSort('name')}>
                        Product <SortIcon field="name" current={sortBy} dir={sortDir} />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('sku')}>
                        SKU <SortIcon field="sku" current={sortBy} dir={sortDir} />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('price')}>
                        Price <SortIcon field="price" current={sortBy} dir={sortDir} />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('stock')}>
                        Stock <SortIcon field="stock" current={sortBy} dir={sortDir} />
                      </TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('isActive')}>
                        Status <SortIcon field="isActive" current={sortBy} dir={sortDir} />
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((product) => {
                      const totalStock = getProductTotalStock(product);
                      const isChecked = selected.has(product._id);
                      return (
                        <TableRow key={product._id} className={isChecked ? 'bg-primary/5' : undefined}>
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
                                src={product.images[0] as string}
                                alt={product.imageAlts?.[0] || product.name}
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
                              {product.specialOfferActive && product.specialOfferPrice && (
                                <p className="text-xs text-green-600 font-medium">
                                  {product.specialOfferLabel || 'Offer'}: {formatCurrency(product.specialOfferPrice)}
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
                      Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total} products
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data.hasPrevious}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!data.hasNext}>
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
      {/* Delete product confirmation */}
      <Dialog open={!!deleteConfirmProduct} onOpenChange={(open) => { if (!open) setDeleteConfirmProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirmProduct?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmProduct(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteConfirmProduct) {
                  deleteMutation.mutate(deleteConfirmProduct._id);
                  setDeleteConfirmProduct(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} Product{selected.size !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              This will permanently delete {selected.size} product{selected.size !== 1 ? 's' : ''}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selected));
                setShowBulkDeleteConfirm(false);
              }}
            >
              {bulkDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
