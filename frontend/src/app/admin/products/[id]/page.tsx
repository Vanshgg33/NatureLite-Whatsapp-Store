'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedValue } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, X, Upload, Trash2, AlertCircle, Plus, ChevronUp, ChevronDown, Video, Globe, Leaf, AlertTriangle, Link2, ShoppingBag, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleEditor } from '@/components/admin/simple-editor';
import { api } from '@/lib/api';
import { BarcodeScanCard } from '@/components/admin/barcode-scan-card';
import type { BarcodeProduct } from '@/lib/barcode-lookup';
import type { NutritionalFactRow, Product } from '@/types';

type VariantRow = { name: string; sku: string; price: string; compareAtPrice: string; stock: string; images: string[] };
type NutritionRow = NutritionalFactRow;

function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-input'}`}
      aria-label={label}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const productId = params.id as string;

  const [formData, setFormData] = useState({
    name: '', shortDescription: '', description: '', category: '',
    price: '', compareAtPrice: '', sku: '',
    specialOfferPrice: '', specialOfferLabel: '', specialOfferActive: false,
    stock: '0', trackStock: true, lowStockThreshold: '5',
    isActive: true, isFeatured: false, hsnCode: '', tags: '',
    videoUrl: '',
    seoTitle: '', seoDescription: '', seoKeywords: '', canonicalUrl: '',
    batchNumber: '', batchDate: '', batchYieldKg: '', batchMilkLitres: '',
    batchOrigin: '', nextBatchDays: '', purityClaims: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [imageAlts, setImageAlts] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [nutritionRows, setNutritionRows] = useState<NutritionRow[]>([{ name: '', per100g: '', perServing: '' }]);
  const [nutritionActive, setNutritionActive] = useState(false);
  const [ingredients, setIngredients] = useState('');
  const [ingredientsActive, setIngredientsActive] = useState(false);
  const [allergen, setAllergen] = useState('');
  const [allergenActive, setAllergenActive] = useState(false);
  const debouncedSku = useDebouncedValue(formData.sku, 400);
  const [relatedSearch, setRelatedSearch] = useState('');
  const debouncedRelatedSearch = useDebouncedValue(relatedSearch, 300);
  const [relatedProducts, setRelatedProducts] = useState<{ id: string; name: string }[]>([]);
  const [upsellSearch, setUpsellSearch] = useState('');
  const debouncedUpsellSearch = useDebouncedValue(upsellSearch, 300);
  const [upsellProducts, setUpsellProducts] = useState<{ id: string; name: string }[]>([]);
  const [productVideos, setProductVideos] = useState<string[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [labReportUrl, setLabReportUrl] = useState('');
  const [labReportUploading, setLabReportUploading] = useState(false);
  const [skuError, setSkuError] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const initialized = useRef(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.getProduct(productId),
    refetchOnWindowFocus: false,
  });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.getCategories({ limit: 100 }) });
  const { data: searchResults } = useQuery({
    queryKey: ['product-search', debouncedRelatedSearch],
    queryFn: () => debouncedRelatedSearch.length > 1 ? api.searchProducts(debouncedRelatedSearch) : Promise.resolve([]),
    enabled: debouncedRelatedSearch.length > 1,
  });
  const { data: upsellResults } = useQuery({
    queryKey: ['product-search-upsell', debouncedUpsellSearch],
    queryFn: () => debouncedUpsellSearch.length > 1 ? api.searchProducts(debouncedUpsellSearch) : Promise.resolve([]),
    enabled: debouncedUpsellSearch.length > 1,
  });

  useEffect(() => {
    if (!product || initialized.current) return;
    initialized.current = true;
    const categoryValue = product.category && typeof product.category === 'object'
      ? (product.category as { _id: string })._id
      : (typeof product.category === 'string' ? product.category : '');

    setFormData({
      name: product.name,
      description: product.description || '',
      shortDescription: product.shortDescription || '',
      category: categoryValue,
      price: product.price.toString(),
      compareAtPrice: product.compareAtPrice?.toString() || '',
      specialOfferPrice: product.specialOfferPrice?.toString() || '',
      specialOfferLabel: product.specialOfferLabel || '',
      specialOfferActive: product.specialOfferActive || false,
      sku: product.sku,
      stock: product.stock.toString(),
      trackStock: product.trackStock,
      lowStockThreshold: product.lowStockThreshold.toString(),
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      hsnCode: product.hsnCode || '',
      tags: product.tags.join(', '),
      videoUrl: product.videoUrl || '',
      seoTitle: product.seo?.title || '',
      seoDescription: product.seo?.description || '',
      seoKeywords: product.seo?.keywords || '',
      canonicalUrl: product.seo?.canonicalUrl || '',
      batchNumber: product.batchInfo?.batchNumber || '',
      batchDate: product.batchInfo?.batchDate ? product.batchInfo.batchDate.slice(0, 10) : '',
      batchYieldKg: product.batchInfo?.yieldKg?.toString() || '',
      batchMilkLitres: product.batchInfo?.milkLitres?.toString() || '',
      batchOrigin: product.batchInfo?.origin || '',
      nextBatchDays: product.batchInfo?.nextBatchDays?.toString() || '',
      purityClaims: (product.batchInfo?.purityClaims || []).join(', '),
    });
    setImages(product.images || []);
    setImageAlts(product.imageAlts || (product.images || []).map(() => ''));
    setProductVideos(product.videos || []);
    setVariants((product.variants || []).map((v) => ({
      name: v.name, sku: v.sku,
      price: v.price.toString(),
      compareAtPrice: v.compareAtPrice?.toString() || '',
      stock: v.stock.toString(),
      images: v.images || [],
    })));
    if (product.nutritionalFacts) {
      setNutritionActive(product.nutritionalFacts.isActive);
      setNutritionRows(product.nutritionalFacts.rows.length > 0 ? product.nutritionalFacts.rows : [{ name: '', per100g: '', perServing: '' }]);
    }
    if (product.ingredients) {
      setIngredientsActive(product.ingredients.isActive);
      setIngredients(product.ingredients.text);
    }
    if (product.allergenDeclaration) {
      setAllergenActive(product.allergenDeclaration.isActive);
      setAllergen(product.allergenDeclaration.text);
    }
    if (product.relatedProducts) {
      setRelatedProducts(product.relatedProducts.map((p) =>
        typeof p === 'string' ? { id: p, name: p } : { id: p._id, name: p.name }
      ));
    }
    if (product.upsellProducts) {
      setUpsellProducts(product.upsellProducts.map((p) =>
        typeof p === 'string' ? { id: p, name: p } : { id: p._id, name: p.name }
      ));
    }
    setLabReportUrl(product.labReportUrl || '');
  }, [product]);

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateProduct>[1]) => api.updateProduct(productId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['product', productId] }); queryClient.invalidateQueries({ queryKey: ['products'] }); router.push('/admin/products'); },
    onError: (error: Error) => setSubmitError(extractErrorMessage(error, 'Failed to update product.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProduct(productId),
    onSuccess: () => router.push('/admin/products'),
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, variantIndex?: number) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    setSubmitError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await api.uploadImage(file, 'products');
        if (variantIndex !== undefined) {
          setVariants((prev) => prev.map((v, i) => i === variantIndex ? { ...v, images: [...v.images, result.secureUrl] } : v));
        } else {
          setImages((prev) => [...prev, result.secureUrl]);
          setImageAlts((prev) => [...prev, '']);
        }
      }
    } catch (error) { setSubmitError(extractErrorMessage(error, 'Image upload failed.')); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= images.length) return;
    setImages((prev) => { const a = [...prev]; [a[index], a[to]] = [a[to], a[index]]; return a; });
    setImageAlts((prev) => { const a = [...prev]; [a[index], a[to]] = [a[to], a[index]]; return a; });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageAlts((prev) => prev.filter((_, i) => i !== index));
  };

  const updateImageAlt = (index: number, alt: string) => setImageAlts((prev) => prev.map((a, i) => i === index ? alt : a));

  const addVariant = () => setVariants((prev) => [...prev, { name: '', sku: '', price: '', compareAtPrice: '', stock: '0', images: [] }]);
  const updateVariant = (index: number, field: keyof VariantRow, value: string) =>
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  const removeVariant = (index: number) => setVariants((prev) => prev.filter((_, i) => i !== index));

  const addNutritionRow = () => setNutritionRows((prev) => [...prev, { name: '', per100g: '', perServing: '' }]);
  const updateNutritionRow = (index: number, field: keyof NutritionRow, value: string) =>
    setNutritionRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  const removeNutritionRow = (index: number) => setNutritionRows((prev) => prev.filter((_, i) => i !== index));

  const addRelated = useCallback((p: Product) => {
    setRelatedProducts((prev) => prev.find((x) => x.id === p._id) ? prev : [...prev, { id: p._id, name: p.name }]);
    setRelatedSearch('');
  }, []);
  const removeRelated = (id: string) => setRelatedProducts((prev) => prev.filter((p) => p.id !== id));

  const addUpsell = useCallback((p: Product) => {
    setUpsellProducts((prev) => prev.find((x) => x.id === p._id) ? prev : [...prev, { id: p._id, name: p.name }]);
    setUpsellSearch('');
  }, []);
  const removeUpsell = (id: string) => setUpsellProducts((prev) => prev.filter((p) => p.id !== id));

  const originalSku = product?.sku ?? '';

  useEffect(() => {
    if (debouncedSku.length < 3 || debouncedSku === originalSku) { setSkuError(''); return; }
    api.checkSkuExists(debouncedSku).then((exists) => {
      setSkuError(exists ? `SKU "${debouncedSku}" is already in use` : '');
    });
  }, [debouncedSku, originalSku]);

  const set = (field: string, value: string | boolean) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const categoryId = formData.category?.trim() || '';
    if (!categoryId) { setSubmitError('Please select a category before saving.'); return; }

    updateMutation.mutate({
      name: formData.name,
      description: formData.description,
      shortDescription: formData.shortDescription,
      category: categoryId,
      price: parseFloat(formData.price),
      compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : undefined,
      specialOfferPrice: formData.specialOfferPrice ? parseFloat(formData.specialOfferPrice) : undefined,
      specialOfferLabel: formData.specialOfferLabel || undefined,
      specialOfferActive: formData.specialOfferActive,
      sku: formData.sku,
      stock: parseInt(formData.stock),
      trackStock: formData.trackStock,
      lowStockThreshold: parseInt(formData.lowStockThreshold),
      isActive: formData.isActive,
      isFeatured: formData.isFeatured,
      hsnCode: formData.hsnCode || undefined,
      images,
      imageAlts,
      videoUrl: formData.videoUrl || undefined,
      videos: productVideos.filter(Boolean),
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
      seo: (formData.seoTitle || formData.seoDescription || formData.seoKeywords || formData.canonicalUrl) ? {
        title: formData.seoTitle || undefined,
        description: formData.seoDescription || undefined,
        keywords: formData.seoKeywords || undefined,
        canonicalUrl: formData.canonicalUrl || undefined,
      } : undefined,
      nutritionalFacts: nutritionActive || nutritionRows.some((r) => r.name) ? {
        isActive: nutritionActive,
        rows: nutritionRows.filter((r) => r.name),
      } : undefined,
      ingredients: (ingredients || ingredientsActive) ? { isActive: ingredientsActive, text: ingredients } : undefined,
      allergenDeclaration: (allergen || allergenActive) ? { isActive: allergenActive, text: allergen } : undefined,
      relatedProducts: relatedProducts.map((p) => p.id),
      upsellProducts: upsellProducts.map((p) => p.id),
      variants: variants.filter((v) => v.name && v.sku && v.price).map((v) => ({
        name: v.name, sku: v.sku,
        price: parseFloat(v.price),
        compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : undefined,
        stock: parseInt(v.stock) || 0,
        attributes: {},
        images: v.images,
      })),
      batchInfo: (formData.batchNumber || formData.batchDate || formData.batchOrigin) ? {
        batchNumber: formData.batchNumber || undefined,
        batchDate: formData.batchDate || undefined,
        yieldKg: formData.batchYieldKg ? parseFloat(formData.batchYieldKg) : undefined,
        milkLitres: formData.batchMilkLitres ? parseFloat(formData.batchMilkLitres) : undefined,
        origin: formData.batchOrigin || undefined,
        nextBatchDays: formData.nextBatchDays ? parseInt(formData.nextBatchDays) : undefined,
        purityClaims: formData.purityClaims ? formData.purityClaims.split(',').map((s) => s.trim()).filter(Boolean) : [],
      } : undefined,
      labReportUrl: labReportUrl || undefined,
    } as Parameters<typeof api.updateProduct>[1]);
  };

  const handleLabReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabReportUploading(true);
    try {
      const result = await api.uploadDocument(file, 'lab-reports');
      setLabReportUrl(result.secureUrl);
    } catch (error) {
      setSubmitError(extractErrorMessage(error, 'Lab report upload failed.'));
    } finally {
      setLabReportUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = () => { if (confirm('Delete this product?')) deleteMutation.mutate(); };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <Header title="Edit Product" description={product?.name}
        action={
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            <Link href="/admin/products"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {submitError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{submitError}</AlertDescription></Alert>}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <BarcodeScanCard onProductFound={(p: BarcodeProduct) => {
              if (p.name) set('name', p.name);
              if (p.sku) set('sku', p.sku);
              if (p.description) set('description', p.description);
              if (p.quantity) set('shortDescription', `Size: ${p.quantity}`);
              if (p.imageUrl && !images.includes(p.imageUrl)) { setImages((prev) => [...prev, p.imageUrl!]); setImageAlts((prev) => [...prev, '']); }
            }} />

            {/* Basic Info */}
            <Card>
              <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input value={formData.name} onChange={(e) => set('name', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Short Description</Label>
                  <Input value={formData.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Full Description</Label>
                  <SimpleEditor value={formData.description} onChange={(html) => set('description', html)} placeholder="Detailed product description..." minHeight={160} />
                </div>
              </CardContent>
            </Card>

            {/* Images */}
            <Card>
              <CardHeader><CardTitle>Images & Media</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {images.map((url, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-xl bg-muted/20">
                      <div className="relative w-16 h-16 shrink-0">
                        <Image src={url} alt={imageAlts[index] || `Image ${index + 1}`} fill className="object-cover rounded-lg" />
                        {index === 0 && <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] bg-black/60 text-white rounded-b-lg">Cover</span>}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Input placeholder="Alt text (SEO)" value={imageAlts[index] || ''} onChange={(e) => updateImageAlt(index, e.target.value)} className="text-sm h-8" />
                        <p className="text-xs text-muted-foreground truncate">{url.split('/').pop()}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => removeImage(index)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-5 cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{uploading ? 'Uploading…' : 'Add Images'}</span>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
                  </label>
                </div>
                {/* ── Product Videos ── */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Product Videos</Label>
                  <p className="text-xs text-muted-foreground -mt-1">Paste YouTube, YouTube Shorts, Instagram Reels, or Vimeo URLs. These appear in the &quot;Watch in Action&quot; section on the product page.</p>

                  {/* Existing URLs */}
                  {productVideos.length > 0 && (
                    <div className="space-y-2">
                      {productVideos.map((url, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border">
                          <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground flex-1 truncate font-mono">{url}</span>
                          <button
                            type="button"
                            onClick={() => setProductVideos(productVideos.filter((_, i) => i !== idx))}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new URL */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://youtube.com/watch?v=... or instagram.com/reel/..."
                      value={newVideoUrl}
                      onChange={(e) => setNewVideoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = newVideoUrl.trim();
                          if (trimmed && !productVideos.includes(trimmed)) {
                            setProductVideos([...productVideos, trimmed]);
                            setNewVideoUrl('');
                          }
                        }
                      }}
                      className="text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const trimmed = newVideoUrl.trim();
                        if (trimmed && !productVideos.includes(trimmed)) {
                          setProductVideos([...productVideos, trimmed]);
                          setNewVideoUrl('');
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {productVideos.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic">No videos added yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>MRP (₹)</Label>
                    <Input type="number" min="0" step="0.01" value={formData.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value)} placeholder="Original price" />
                    <p className="text-xs text-muted-foreground">Strikethrough price</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Sale Price (₹) *</Label>
                    <Input type="number" min="0" step="0.01" value={formData.price} onChange={(e) => set('price', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Special Offer Price (₹)</Label>
                      <Toggle checked={formData.specialOfferActive} onChange={(v) => set('specialOfferActive', v)} label="Special offer" />
                    </div>
                    <Input type="number" min="0" step="0.01" value={formData.specialOfferPrice} onChange={(e) => set('specialOfferPrice', e.target.value)} disabled={!formData.specialOfferActive} placeholder="e.g. 399" />
                    <Input placeholder="Offer label (e.g. Festive Offer)" value={formData.specialOfferLabel} onChange={(e) => set('specialOfferLabel', e.target.value)} className="text-sm" disabled={!formData.specialOfferActive} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Product SKU *</Label>
                  <Input
                    value={formData.sku}
                    onChange={(e) => set('sku', e.target.value.toUpperCase())}
                    placeholder="e.g. OIL-001"
                    className={skuError ? 'border-red-500' : ''}
                    required
                  />
                  {skuError && <p className="text-sm text-red-500">{skuError}</p>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>HSN Code</Label>
                    <Input value={formData.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Variants */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Size / Weight Variants</span>
                  <Button type="button" variant="outline" size="sm" onClick={addVariant}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No variants. Add for different sizes/weights.</p>
                ) : (
                  <div className="space-y-4">
                    {variants.map((variant, index) => (
                      <div key={index} className="border rounded-xl p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-5 items-end">
                          <div className="space-y-1"><Label className="text-xs">Name *</Label><Input placeholder="500ml" value={variant.name} onChange={(e) => updateVariant(index, 'name', e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">SKU *</Label><Input placeholder="OIL-500ML" value={variant.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value.toUpperCase())} /></div>
                          <div className="space-y-1"><Label className="text-xs">MRP (₹)</Label><Input type="number" min="0" step="0.01" value={variant.compareAtPrice} onChange={(e) => updateVariant(index, 'compareAtPrice', e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Sale Price (₹) *</Label><Input type="number" min="0" step="0.01" value={variant.price} onChange={(e) => updateVariant(index, 'price', e.target.value)} /></div>
                          <div className="space-y-1"><Label className="text-xs">Stock</Label><Input type="number" min="0" value={variant.stock} onChange={(e) => updateVariant(index, 'stock', e.target.value)} /></div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer border rounded-lg px-3 py-2 hover:bg-muted/40">
                              <Upload className="h-3.5 w-3.5" />
                              {variant.images.length > 0 ? `${variant.images.length} image(s)` : 'Add variant images'}
                              <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, index)} className="hidden" disabled={uploading} />
                            </label>
                          </div>
                          <div className="flex gap-1">
                            {variant.images.slice(0, 3).map((img, ii) => (
                              <div key={ii} className="relative w-8 h-8">
                                <Image src={img} alt="" fill className="object-cover rounded" />
                                <button type="button" onClick={() => setVariants((prev) => prev.map((v, vi) => vi === index ? { ...v, images: v.images.filter((_, iii) => iii !== ii) } : v))} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center"><X className="h-2 w-2" /></button>
                              </div>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(index)} className="text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nutritional Facts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Leaf className="h-4 w-4 text-green-600" /> Nutritional Facts</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{nutritionActive ? 'Visible' : 'Hidden'}</span>
                    <Toggle checked={nutritionActive} onChange={setNutritionActive} label="Show nutritional facts" />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-3 font-medium text-muted-foreground text-xs">Nutrient</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Per 100g</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Per Serving</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {nutritionRows.map((row, i) => (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1.5 pr-3"><Input value={row.name} onChange={(e) => updateNutritionRow(i, 'name', e.target.value)} placeholder="Energy" className="h-7 text-xs" /></td>
                          <td className="py-1.5 px-3"><Input value={row.per100g} onChange={(e) => updateNutritionRow(i, 'per100g', e.target.value)} placeholder="0 kcal" className="h-7 text-xs" /></td>
                          <td className="py-1.5 px-3"><Input value={row.perServing} onChange={(e) => updateNutritionRow(i, 'perServing', e.target.value)} placeholder="0 kcal" className="h-7 text-xs" /></td>
                          <td className="py-1.5"><button type="button" onClick={() => removeNutritionRow(i)} className="p-1 hover:text-destructive"><X className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addNutritionRow} className="mt-3"><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
              </CardContent>
            </Card>

            {/* Ingredients */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Leaf className="h-4 w-4 text-emerald-600" /> Ingredients</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{ingredientsActive ? 'Visible' : 'Hidden'}</span>
                    <Toggle checked={ingredientsActive} onChange={setIngredientsActive} label="Show ingredients" />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Pure A2 Cow Milk (100%)" rows={3} className="w-full text-sm border border-input rounded-md px-3 py-2 resize-y outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
              </CardContent>
            </Card>

            {/* Allergen */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Allergen Declaration</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{allergenActive ? 'Visible' : 'Hidden'}</span>
                    <Toggle checked={allergenActive} onChange={setAllergenActive} label="Show allergen info" />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea value={allergen} onChange={(e) => setAllergen(e.target.value)} placeholder="Contains milk and dairy products." rows={3} className="w-full text-sm border border-input rounded-md px-3 py-2 resize-y outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
              </CardContent>
            </Card>

            {/* SEO */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> SEO</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>SEO Title</Label>
                  <Input value={formData.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} placeholder="Defaults to product name" />
                  <p className="text-xs text-muted-foreground">{formData.seoTitle.length}/60 characters</p>
                </div>
                <div className="space-y-2">
                  <Label>SEO Description</Label>
                  <textarea value={formData.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} placeholder="150–160 chars for best results" rows={3} className="w-full text-sm border border-input rounded-md px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
                  <p className="text-xs text-muted-foreground">{formData.seoDescription.length}/160 characters</p>
                </div>
                <div className="space-y-2">
                  <Label>Keywords</Label>
                  <Input value={formData.seoKeywords} onChange={(e) => set('seoKeywords', e.target.value)} placeholder="bilona ghee, a2 ghee" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Canonical URL</Label>
                  <Input value={formData.canonicalUrl} onChange={(e) => set('canonicalUrl', e.target.value)} placeholder="https://..." />
                </div>
              </CardContent>
            </Card>

            {/* Related / Upsell */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Related & Upsell Products</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Related Products (shown on product page)</Label>
                  <Input placeholder="Search…" value={relatedSearch} onChange={(e) => setRelatedSearch(e.target.value)} />
                  {searchResults && searchResults.length > 0 && relatedSearch && (
                    <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                      {(searchResults as Product[]).map((p) => (
                        <button key={p._id} type="button" onClick={() => addRelated(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between">
                          <span>{p.name}</span><Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {relatedProducts.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                        {p.name}<button type="button" onClick={() => removeRelated(p.id)}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Upsell / Cross-sell</Label>
                  <Input placeholder="Search…" value={upsellSearch} onChange={(e) => setUpsellSearch(e.target.value)} />
                  {upsellResults && upsellResults.length > 0 && upsellSearch && (
                    <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                      {(upsellResults as Product[]).map((p) => (
                        <button key={p._id} type="button" onClick={() => addUpsell(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between">
                          <span>{p.name}</span><Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {upsellProducts.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                        {p.name}<button type="button" onClick={() => removeUpsell(p.id)}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={formData.category} onValueChange={(value) => set('category', value)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories?.items.map((cat) => <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <Input value={formData.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Comma separated" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Status</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Active (visible)</Label>
                  <Toggle checked={formData.isActive} onChange={(v) => set('isActive', v)} label="Active" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Featured</Label>
                  <Toggle checked={formData.isFeatured} onChange={(v) => set('isFeatured', v)} label="Featured" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Stock</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Track stock</Label>
                  <Toggle checked={formData.trackStock} onChange={(v) => set('trackStock', v)} label="Track stock" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Stock</Label><Input type="number" min="0" value={formData.stock} onChange={(e) => set('stock', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Low stock at</Label><Input type="number" min="0" value={formData.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Batch &amp; Purity</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Batch No.</Label><Input placeholder="A2-47" value={formData.batchNumber} onChange={(e) => set('batchNumber', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Batch Date</Label><Input type="date" value={formData.batchDate} onChange={(e) => set('batchDate', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Yield (kg)</Label><Input type="number" step="0.1" value={formData.batchYieldKg} onChange={(e) => set('batchYieldKg', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Milk (L)</Label><Input type="number" step="0.1" value={formData.batchMilkLitres} onChange={(e) => set('batchMilkLitres', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Origin</Label><Input placeholder="Rajasthan" value={formData.batchOrigin} onChange={(e) => set('batchOrigin', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Next batch (days)</Label><Input type="number" value={formData.nextBatchDays} onChange={(e) => set('nextBatchDays', e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Purity claims</Label><Input placeholder="0% additives, 0% heat" value={formData.purityClaims} onChange={(e) => set('purityClaims', e.target.value)} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Lab Report</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {labReportUrl ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/40">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <a href={labReportUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate flex-1">View current report</a>
                    <button type="button" onClick={() => setLabReportUrl('')} className="shrink-0"><X className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No lab report uploaded.</p>
                )}
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors">
                    <Upload className="h-4 w-4" />
                    {labReportUploading ? 'Uploading…' : labReportUrl ? 'Replace PDF' : 'Upload PDF'}
                  </div>
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleLabReportUpload} disabled={labReportUploading} />
                </label>
                <p className="text-xs text-muted-foreground">PDF accepted. Will be shown to customers on the product page.</p>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={updateMutation.isPending || uploading || labReportUploading}>
              {updateMutation.isPending ? 'Saving…' : uploading ? 'Uploading…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
