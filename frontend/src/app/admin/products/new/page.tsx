'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, X, Upload, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { validateProduct, getFieldError, ValidationError } from '@/lib/validation';

export default function NewProductPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    shortDescription: '',
    category: '',
    price: '',
    compareAtPrice: '',
    sku: '',
    stock: '0',
    trackStock: true,
    lowStockThreshold: '5',
    isActive: true,
    isFeatured: false,
    gstPercentage: '18',
    hsnCode: '',
    tags: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<{ name: string; sku: string; price: string; compareAtPrice: string; stock: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createProduct>[0]) => api.createProduct(data),
    onSuccess: () => {
      router.push('/admin/products');
    },
    onError: (error: Error) => {
      setSubmitError(error.message || 'Failed to create product. Please try again.');
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await api.uploadImage(file, 'products');
        setImages((prev) => [...prev, result.secureUrl]);
      }
    } catch (error) {
      setSubmitError('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, { name: '', sku: '', price: '', compareAtPrice: '', stock: '0' }]);
  };

  const updateVariant = (index: number, field: string, value: string) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSubmitError(null);

    // Validate form
    const validation = validateProduct(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      shortDescription: formData.shortDescription,
      category: formData.category,
      price: parseFloat(formData.price),
      compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : undefined,
      sku: formData.sku,
      stock: parseInt(formData.stock),
      trackStock: formData.trackStock,
      lowStockThreshold: parseInt(formData.lowStockThreshold),
      isActive: formData.isActive,
      isFeatured: formData.isFeatured,
      gstPercentage: parseFloat(formData.gstPercentage),
      hsnCode: formData.hsnCode || undefined,
      images,
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
      variants: variants
        .filter((v) => v.name && v.sku && v.price)
        .map((v) => ({
          name: v.name,
          sku: v.sku,
          price: parseFloat(v.price),
          compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : undefined,
          stock: parseInt(v.stock) || 0,
          attributes: {},
        })),
    });
  };

  const getError = (field: string) => getFieldError(errors, field);

  return (
    <div>
      <Header
        title="Add Product"
        description="Create a new product"
        action={
          <Link href="/admin/products">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please fix the following errors:
              <ul className="list-disc list-inside mt-2">
                {errors.map((error, i) => (
                  <li key={i}>{error.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter product name"
                    className={getError('name') ? 'border-red-500' : ''}
                  />
                  {getError('name') && (
                    <p className="text-sm text-red-500">{getError('name')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Short Description</Label>
                  <Input
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                    placeholder="Brief description for listings"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Full Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed product description"
                    rows={5}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Images</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {images.map((url, index) => (
                    <div key={index} className="relative aspect-square">
                      <Image
                        src={url}
                        alt={`Product ${index + 1}`}
                        fill
                        className="object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      {uploading ? 'Uploading...' : 'Upload'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price (₹) *</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      className={getError('price') ? 'border-red-500' : ''}
                    />
                    {getError('price') && (
                      <p className="text-sm text-red-500">{getError('price')}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="compareAtPrice">Compare at Price (₹)</Label>
                    <Input
                      id="compareAtPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.compareAtPrice}
                      onChange={(e) => setFormData({ ...formData, compareAtPrice: e.target.value })}
                      placeholder="Original price"
                      className={getError('compareAtPrice') ? 'border-red-500' : ''}
                    />
                    {getError('compareAtPrice') && (
                      <p className="text-sm text-red-500">{getError('compareAtPrice')}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gstPercentage">GST %</Label>
                    <Input
                      id="gstPercentage"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.gstPercentage}
                      onChange={(e) => setFormData({ ...formData, gstPercentage: e.target.value })}
                      className={getError('gstPercentage') ? 'border-red-500' : ''}
                    />
                    {getError('gstPercentage') && (
                      <p className="text-sm text-red-500">{getError('gstPercentage')}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hsnCode">HSN Code</Label>
                    <Input
                      id="hsnCode"
                      value={formData.hsnCode}
                      onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                      placeholder="HSN/SAC Code"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                      placeholder="Stock Keeping Unit"
                      className={getError('sku') ? 'border-red-500' : ''}
                    />
                    {getError('sku') && (
                      <p className="text-sm text-red-500">{getError('sku')}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stock">Stock Quantity</Label>
                    <Input
                      id="stock"
                      type="number"
                      min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      className={getError('stock') ? 'border-red-500' : ''}
                    />
                    {getError('stock') && (
                      <p className="text-sm text-red-500">{getError('stock')}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lowStockThreshold">Low Stock Alert</Label>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      min="0"
                      value={formData.lowStockThreshold}
                      onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="trackStock"
                    checked={formData.trackStock}
                    onChange={(e) => setFormData({ ...formData, trackStock: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="trackStock">Track stock quantity</Label>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Size / Weight Variants</span>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                    + Add Variant
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No variants. Add variants for different sizes like 250ml, 500ml, 1L or 250g, 500g, 1kg.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {variants.map((variant, index) => (
                      <div key={index} className="grid gap-3 md:grid-cols-6 items-end p-4 border rounded-lg">
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input
                            placeholder="e.g. 500ml"
                            value={variant.name}
                            onChange={(e) => updateVariant(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">SKU *</Label>
                          <Input
                            placeholder="e.g. OIL-500ML"
                            value={variant.sku}
                            onChange={(e) => updateVariant(index, 'sku', e.target.value.toUpperCase())}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Price (₹) *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={variant.price}
                            onChange={(e) => updateVariant(index, 'price', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">MRP (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={variant.compareAtPrice}
                            onChange={(e) => updateVariant(index, 'compareAtPrice', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Stock</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={variant.stock}
                            onChange={(e) => updateVariant(index, 'stock', e.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVariant(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className={getError('category') ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.items.map((cat) => (
                        <SelectItem key={cat._id} value={cat._id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {getError('category') && (
                    <p className="text-sm text-red-500">{getError('category')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Comma separated tags"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="isActive">Active (visible to customers)</Label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isFeatured"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="isFeatured">Featured product</Label>
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Product'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
