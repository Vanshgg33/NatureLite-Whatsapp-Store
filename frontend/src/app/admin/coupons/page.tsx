'use client';

import { useState } from 'react';
import { getApiError } from '@/lib/api-error';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Tag, AlertCircle, ChevronDown, ChevronUp, X as XIcon, Search } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatCurrency, formatShortDate } from '@/lib/utils';
import { Coupon, CreateCouponDto, Product, Category, User } from '@/types';

export default function CouponsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Coupon | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 10,
    maxDiscount: '',
    minOrderAmount: 0,
    maxUsageCount: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isActive: true,
    isFirstOrderOnly: false,
    allowedUsers: [] as string[],
    allowedProducts: [] as string[],
    allowedCategories: [] as string[],
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  // id → display label for chips (populated when user searches + selects, or shows raw id on edit)
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', page],
    queryFn: () => api.getCoupons({ page, limit: 20 }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.getCategories({ limit: 100, isActive: true }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: productResults } = useQuery({
    queryKey: ['coupon-product-search', productSearch],
    queryFn: () => api.getProducts({ search: productSearch, limit: 8, isActive: true }),
    enabled: productSearch.length >= 2,
  });

  const { data: userResults } = useQuery({
    queryKey: ['coupon-user-search', userSearch],
    queryFn: () => api.getUsers({ search: userSearch, limit: 8 }),
    enabled: userSearch.length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCouponDto) => api.createCoupon(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      closeDialog();
      toast({ title: 'Coupon created' });
    },
    onError: (error: unknown) => {
      // Without this handler the dialog silently stays open and the admin
      // thinks nothing happened. Surface the actual backend reason instead.
      setSubmitError(getApiError(error,'Failed to create coupon.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Coupon> }) =>
      api.updateCoupon(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      closeDialog();
      toast({ title: 'Coupon updated' });
    },
    onError: (error: unknown) => {
      setSubmitError(getApiError(error,'Failed to update coupon.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setDeleteConfirm(null);
      toast({ title: 'Coupon deleted' });
    },
    onError: (error: unknown) => {
      toast({
        title: getApiError(error,'Failed to delete coupon.'),
        variant: 'destructive',
      });
    },
  });

  // Inline row-level status toggle — flips isActive without opening the dialog.
  // Optimistic update so the switch feels instant; rolls back + toasts on failure.
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateCoupon(id, { isActive }),
    onMutate: ({ id, isActive }) => {
      const previous = queryClient.getQueryData<{ items: Coupon[] }>(['coupons', page]);
      if (previous) {
        queryClient.setQueryData(['coupons', page], {
          ...previous,
          items: previous.items.map((c) => (c._id === id ? { ...c, isActive } : c)),
        });
      }
      return { previous };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['coupons', page], ctx.previous);
      toast({
        title: getApiError(error,'Failed to update status.'),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });

  const openCreateDialog = () => {
    setEditingCoupon(null);
    setFormData({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: 10,
      maxDiscount: '',
      minOrderAmount: 0,
      maxUsageCount: '',
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: true,
      isFirstOrderOnly: false,
      allowedUsers: [],
      allowedProducts: [],
      allowedCategories: [],
    });
    setProductLabels({});
    setUserLabels({});
    setProductSearch('');
    setUserSearch('');
    setShowAdvanced(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    const existingProducts = coupon.allowedProducts || [];
    const existingUsers = coupon.allowedUsers || [];
    setFormData({
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount?.toString() || '',
      minOrderAmount: coupon.minOrderAmount,
      maxUsageCount: coupon.maxUsageCount?.toString() || '',
      validFrom: coupon.validFrom ? new Date(coupon.validFrom).toISOString().split('T')[0] : '',
      validUntil: coupon.validUntil ? new Date(coupon.validUntil).toISOString().split('T')[0] : '',
      isActive: coupon.isActive,
      isFirstOrderOnly: coupon.isFirstOrderOnly || false,
      allowedUsers: existingUsers,
      allowedProducts: existingProducts,
      allowedCategories: coupon.allowedCategories || [],
    });
    // Seed label maps with raw IDs — admin can see what's set (names would require extra fetches)
    setProductLabels(Object.fromEntries(existingProducts.map((id) => [id, id])));
    setUserLabels(Object.fromEntries(existingUsers.map((id) => [id, id])));
    setProductSearch('');
    setUserSearch('');
    const hasAdvanced = coupon.isFirstOrderOnly || existingProducts.length > 0 || existingUsers.length > 0 || (coupon.allowedCategories?.length ?? 0) > 0;
    setShowAdvanced(!!hasAdvanced);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingCoupon(null);
    setSubmitError(null);
    setProductSearch('');
    setUserSearch('');
    setProductLabels({});
    setUserLabels({});
    setShowAdvanced(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const submitData = {
      code: formData.code.toUpperCase(),
      description: formData.description,
      discountType: formData.discountType,
      discountValue: formData.discountValue,
      maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : undefined,
      minOrderAmount: formData.minOrderAmount,
      maxUsageCount: formData.maxUsageCount ? parseInt(formData.maxUsageCount) : undefined,
      validFrom: new Date(formData.validFrom).toISOString(),
      validUntil: new Date(formData.validUntil).toISOString(),
      isActive: formData.isActive,
      isFirstOrderOnly: formData.isFirstOrderOnly || undefined,
      allowedUsers: formData.allowedUsers.length > 0 ? formData.allowedUsers : undefined,
      allowedProducts: formData.allowedProducts.length > 0 ? formData.allowedProducts : undefined,
      allowedCategories: formData.allowedCategories.length > 0 ? formData.allowedCategories : undefined,
    };

    if (editingCoupon) {
      // Remove 'code' — not allowed in UpdateCouponDto
      const { code, ...updateData } = submitData;
      updateMutation.mutate({ id: editingCoupon._id, data: updateData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const isActive = (coupon: Coupon) => {
    const now = new Date();
    return (
      coupon.isActive &&
      new Date(coupon.validFrom) <= now &&
      new Date(coupon.validUntil) >= now
    );
  };

  return (
    <div>
      <Header
        title="Coupons"
        description="Manage discount coupons"
        action={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Create Coupon
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : data?.items?.length === 0 ? (
              <div className="text-center py-12">
                <Tag className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No coupons yet</h3>
                <p className="text-muted-foreground">
                  Create your first coupon to offer discounts.
                </p>
                <Button onClick={openCreateDialog} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Coupon
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Min Order</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items?.map((coupon) => {
                    const active = isActive(coupon);
                    return (
                    <TableRow key={coupon._id}>
                      <TableCell>
                        <code className="px-2 py-1 bg-muted rounded text-sm font-semibold">
                          {coupon.code}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {coupon.description}
                      </TableCell>
                      <TableCell>
                        {coupon.discountType === 'percentage'
                          ? `${coupon.discountValue}%`
                          : formatCurrency(coupon.discountValue)}
                        {coupon.maxDiscount && (
                          <span className="text-xs text-muted-foreground block">
                            max {formatCurrency(coupon.maxDiscount)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(coupon.minOrderAmount)}</TableCell>
                      <TableCell>
                        {coupon.usedCount}
                        {coupon.maxUsageCount && ` / ${coupon.maxUsageCount}`}
                      </TableCell>
                      <TableCell>{coupon.validUntil ? formatShortDate(coupon.validUntil) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={coupon.isActive}
                            disabled={toggleStatusMutation.isPending}
                            onCheckedChange={(checked) =>
                              toggleStatusMutation.mutate({
                                id: coupon._id,
                                isActive: checked,
                              })
                            }
                            aria-label="Toggle coupon status"
                          />
                          <Badge
                            className={
                              active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }
                          >
                            {active ? 'Active' : coupon.isActive ? 'Expired' : 'Off'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(coupon)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirm(coupon)}
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
            )}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {data.totalPages} ({data.total} coupons)
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
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
            </DialogTitle>
            <DialogDescription>
              {editingCoupon
                ? 'Update the coupon details below.'
                : 'Create a new discount coupon for your customers.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Coupon Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="SAVE20"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="discountType">Discount Type</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value: 'percentage' | 'fixed') =>
                      setFormData((prev) => ({ ...prev, discountType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Get 20% off on your first order"
                  required
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="discountValue">
                    {formData.discountType === 'percentage'
                      ? 'Discount Percentage'
                      : 'Discount Amount (₹)'}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        discountValue: parseFloat(e.target.value) || 0,
                      }))
                    }
                    min={0}
                    max={formData.discountType === 'percentage' ? 100 : undefined}
                    required
                  />
                </div>
                {formData.discountType === 'percentage' && (
                  <div className="grid gap-2">
                    <Label htmlFor="maxDiscount">Max Discount (₹)</Label>
                    <Input
                      id="maxDiscount"
                      type="number"
                      value={formData.maxDiscount}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          maxDiscount: e.target.value,
                        }))
                      }
                      placeholder="Optional"
                      min={0}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="minOrderAmount">Min Order Amount (₹)</Label>
                  <Input
                    id="minOrderAmount"
                    type="number"
                    value={formData.minOrderAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        minOrderAmount: parseFloat(e.target.value) || 0,
                      }))
                    }
                    min={0}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxUsageCount">Max Usage Count</Label>
                  <Input
                    id="maxUsageCount"
                    type="number"
                    value={formData.maxUsageCount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxUsageCount: e.target.value,
                      }))
                    }
                    placeholder="Unlimited"
                    min={1}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="validFrom">Valid From</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        validFrom: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="validUntil">Valid Until</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        validUntil: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isActive: checked }))
                  }
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              {/* Advanced Restrictions */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
                >
                  <span>Advanced Restrictions</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {showAdvanced && (
                  <div className="px-4 pb-4 pt-2 space-y-5 border-t">

                    {/* First order only */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">First Order Only</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Only valid on a customer&apos;s first order</p>
                      </div>
                      <Switch
                        checked={formData.isFirstOrderOnly}
                        onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isFirstOrderOnly: checked }))}
                      />
                    </div>

                    {/* Restrict to categories */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Restrict to Categories</Label>
                      <p className="text-xs text-muted-foreground mb-2">Leave empty to allow all categories</p>
                      {categoriesData?.items?.length ? (
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                          {categoriesData.items.map((cat: Category) => (
                            <label key={cat._id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border"
                                checked={formData.allowedCategories.includes(cat._id)}
                                onChange={(e) => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    allowedCategories: e.target.checked
                                      ? [...prev.allowedCategories, cat._id]
                                      : prev.allowedCategories.filter((id) => id !== cat._id),
                                  }));
                                }}
                              />
                              <span className="truncate">{cat.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No categories found</p>
                      )}
                    </div>

                    {/* Restrict to products */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Restrict to Products</Label>
                      <p className="text-xs text-muted-foreground mb-2">Leave empty to allow all products</p>
                      {formData.allowedProducts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {formData.allowedProducts.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                              {productLabels[id] || id}
                              <button type="button" onClick={() => {
                                setFormData((prev) => ({ ...prev, allowedProducts: prev.allowedProducts.filter((p) => p !== id) }));
                                setProductLabels((prev) => { const n = { ...prev }; delete n[id]; return n; });
                              }}>
                                <XIcon className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                      {productSearch.length >= 2 && productResults?.items && (
                        <div className="border rounded-md mt-1 max-h-36 overflow-y-auto divide-y">
                          {productResults.items.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-2">No products found</p>
                          ) : productResults.items.filter((p: Product) => !formData.allowedProducts.includes(p._id)).map((p: Product) => (
                            <button
                              key={p._id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, allowedProducts: [...prev.allowedProducts, p._id] }));
                                setProductLabels((prev) => ({ ...prev, [p._id]: p.name }));
                                setProductSearch('');
                              }}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Restrict to users */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Restrict to Specific Users</Label>
                      <p className="text-xs text-muted-foreground mb-2">Leave empty to allow all users</p>
                      {formData.allowedUsers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {formData.allowedUsers.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                              {userLabels[id] || id}
                              <button type="button" onClick={() => {
                                setFormData((prev) => ({ ...prev, allowedUsers: prev.allowedUsers.filter((u) => u !== id) }));
                                setUserLabels((prev) => { const n = { ...prev }; delete n[id]; return n; });
                              }}>
                                <XIcon className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search by name or phone..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                      {userSearch.length >= 2 && userResults?.items && (
                        <div className="border rounded-md mt-1 max-h-36 overflow-y-auto divide-y">
                          {userResults.items.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-2">No users found</p>
                          ) : userResults.items.filter((u: User) => !formData.allowedUsers.includes(u._id)).map((u: User) => (
                            <button
                              key={u._id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, allowedUsers: [...prev.allowedUsers, u._id] }));
                                setUserLabels((prev) => ({ ...prev, [u._id]: u.name ? `${u.name} (${u.phone})` : u.phone }));
                                setUserSearch('');
                              }}
                            >
                              <span className="font-medium">{u.name || '—'}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{u.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingCoupon
                  ? 'Update'
                  : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Coupon</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the coupon &quot;{deleteConfirm?.code}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm._id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
