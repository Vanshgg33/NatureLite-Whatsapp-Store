'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Check, Loader2, ArrowRight, Minus, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { Product } from '@/types';

// WA Icon SVG
function WaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="currentColor"
      />
      <path
        d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z"
        fill="currentColor"
      />
    </svg>
  );
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

export default function QuickOrderPage() {
  const { toast } = useToast();
  const addItem = useCartStore((s) => s.addItem);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addingToCart, setAddingToCart] = useState(false);

  // 1. Fetch Products & Categories
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['quick-order-products-list'],
    queryFn: () => api.getProducts({ limit: 100, isActive: true }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories } = useQuery({
    queryKey: ['quick-order-categories'],
    queryFn: () => api.getActiveCategories(),
    staleTime: 10 * 60 * 1000,
  });

  const products = productsData?.items ?? [];

  // 2. Flatten Products to expand variants as separate catalog rows
  const catalogRows = useMemo(() => {
    const list: Array<{
      id: string;
      productId: string;
      product: Product;
      name: string;
      slug: string;
      variantName?: string;
      variantSku?: string;
      sku: string;
      price: number;
      compareAtPrice?: number;
      stock: number;
      image: string;
      category: string;
    }> = [];

    products.forEach((p) => {
      if (!p.isActive) return;
      
      const catId = typeof p.category === 'object' && p.category ? (p.category._id || '') : String(p.category || '');

      if (p.variants && p.variants.length > 0) {
        p.variants.forEach((v) => {
          if (!v.isActive) return;
          list.push({
            id: `${p._id}-${v.sku}`,
            productId: p._id,
            product: p,
            name: p.name,
            slug: p.slug,
            variantName: v.name,
            variantSku: v.sku,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            stock: v.stock,
            image: (v.images && v.images.length > 0) ? v.images[0] : p.images[0],
            category: catId,
          });
        });
      } else {
        list.push({
          id: p._id,
          productId: p._id,
          product: p,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          stock: p.stock,
          image: p.images[0],
          category: catId,
        });
      }
    });

    return list;
  }, [products]);

  // 3. Filter list based on search and category tab
  const filteredRows = useMemo(() => {
    return catalogRows.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        (item.variantName && item.variantName.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory =
        activeCategory === 'all' || item.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [catalogRows, search, activeCategory]);

  // 4. Quantity Adjusters
  const handleQuantityChange = (id: string, val: number, stock: number) => {
    const current = quantities[id] ?? 0;
    const next = Math.max(0, current + val);
    if (next > stock) {
      toast({
        title: 'Insufficient Stock',
        description: `Only ${stock} items are available in stock.`,
        variant: 'destructive',
      });
      return;
    }
    setQuantities({ ...quantities, [id]: next });
  };

  // 5. Selected Items Calculation
  const selectedItems = useMemo(() => {
    return filteredRows
      .map((row) => ({
        ...row,
        quantity: quantities[row.id] ?? 0,
      }))
      .filter((item) => item.quantity > 0);
  }, [filteredRows, quantities]);

  const selectedCount = selectedItems.reduce((acc, item) => acc + item.quantity, 0);
  const totalAmount = selectedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // 6. Action Handlers
  const handleAddAllToCart = async () => {
    if (selectedItems.length === 0) return;
    setAddingToCart(true);

    try {
      for (const item of selectedItems) {
        await addItem(
          {
            productId: item.productId,
            name: item.name,
            slug: item.slug,
            image: item.image || '/images/products/placeholder.jpg',
            price: item.price,
            compareAtPrice: item.compareAtPrice,
            variantSku: item.variantSku,
            variantName: item.variantName,
            gstPercentage: item.product.gstPercentage ?? 5,
          },
          item.quantity
        );
      }

      toast({
        title: 'Added to cart!',
        description: `Successfully added ${selectedCount} items to your shopping cart.`,
      });

      // Reset quantities
      setQuantities({});
    } catch (err) {
      console.error('Failed to add multiple items to cart:', err);
      toast({
        title: 'Error adding to cart',
        description: 'Something went wrong while adding selected products.',
        variant: 'destructive',
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const handleOrderWhatsApp = () => {
    if (selectedItems.length === 0) return;

    let message = `Hi Nature Lite Foods! I'd like to place a Quick Order for:\n\n`;
    selectedItems.forEach((item, index) => {
      const itemTitle = item.variantName ? `${item.name} (${item.variantName})` : item.name;
      const subtotal = item.price * item.quantity;
      message += `${index + 1}. *${itemTitle}*\n   Qty: ${item.quantity} x ${formatPrice(item.price)} = *₹${subtotal}*\n\n`;
    });

    message += `*Grand Total: ${formatPrice(totalAmount)}*\n\n`;
    message += `Please confirm my order and share details. Thank you!`;

    const encoded = encodeURIComponent(message);
    const waUrl = `https://wa.me/918817200740?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="min-h-screen pt-24 pb-32" style={{ background: '#f2ece0' }}>
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden pb-12 pt-6" style={{ borderBottom: '1px solid rgba(26,82,16,0.08)' }}>
        {/* Cinematic ambient glow */}
        <div
          className="pointer-events-none absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(160,112,16,0.07) 0%, transparent 70%)', filter: 'blur(70px)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-amber-800 font-semibold mb-2 block font-mono">
              Frictionless Checkout
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#0b1c08]">
              Quick Ordering Pad
            </h1>
            <p className="mt-2 text-sm sm:text-base max-w-2xl leading-relaxed text-[#2e4225]/70">
              Build your wholesale or custom family staples order dynamically. Adjust quantities and checkout immediately via standard Cart or WhatsApp.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 2. Filters Strip */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-3xl bg-white/70 border border-emerald-950/5 shadow-sm">
          {/* Categories select tabs */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold tracking-wide transition-all duration-200 ${
                activeCategory === 'all'
                  ? 'bg-[#0b1c08] text-white shadow-sm'
                  : 'hover:bg-amber-100/50 text-[#0b1c08]/75'
              }`}
            >
              All Categories
            </button>
            {categories?.map((cat) => (
              <button
                key={cat._id}
                onClick={() => setActiveCategory(cat._id)}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold tracking-wide transition-all duration-200 ${
                  activeCategory === cat._id
                    ? 'bg-[#0b1c08] text-white shadow-sm'
                    : 'hover:bg-amber-100/50 text-[#0b1c08]/75'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full lg:w-80 shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or SKU..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs outline-none border border-emerald-950/10 bg-white/90 text-[#0b1c08] focus:ring-1 focus:ring-[#a07010] focus:border-[#a07010] transition-all"
            />
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-emerald-900/40" />
          </div>
        </div>

        {/* 3. Products List */}
        {productsLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-[#a07010] animate-spin" />
            <p className="text-xs text-[#2e4225]/60 font-medium">Loading Staples Catalog...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center space-y-3 p-6 rounded-3xl border border-dashed border-emerald-950/10">
            <Search className="h-10 w-10 text-emerald-900/20 mx-auto" />
            <p className="text-sm font-semibold text-[#0b1c08]">No products found</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              We couldn&apos;t find any items matching your filters. Try adjusting your search query or selecting another category tab.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-3xl border border-emerald-950/5 bg-white/70 shadow-sm">
              <table className="w-full text-sm border-collapse text-left">
                <thead>
                  <tr className="bg-emerald-950/[0.03] border-b border-emerald-950/10 text-xs text-emerald-950/50 uppercase tracking-wider font-semibold font-mono">
                    <th className="px-6 py-4">Product details</th>
                    <th className="px-4 py-4 w-36">SKU</th>
                    <th className="px-4 py-4 w-36">Stock</th>
                    <th className="px-4 py-4 w-32 text-right">Price</th>
                    <th className="px-4 py-4 w-44 text-center">Order Quantity</th>
                    <th className="px-6 py-4 w-36 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/5 text-[#0b1c08]">
                  {filteredRows.map((item) => {
                    const selectedQty = quantities[item.id] ?? 0;
                    const subtotal = item.price * selectedQty;
                    const isOutOfStock = item.stock <= 0;

                    return (
                      <tr key={item.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-emerald-950/5 bg-[#faf9f2]">
                              {item.image ? (
                                <Image src={item.image} alt={item.name} fill className="object-cover" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center font-display font-black text-amber-800/20 text-xl">
                                  {item.name.charAt(0)}
                                </div>
                              )}
                            </div>
                            <div>
                              <Link href={`/products/${item.slug}`} className="font-semibold text-sm hover:text-[#a07010] transition-colors block line-clamp-1">
                                {item.name}
                              </Link>
                              {item.variantName && (
                                <span className="inline-block px-2 py-0.5 mt-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/50 uppercase tracking-wide">
                                  {item.variantName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-[#0b1c08]/60 uppercase tracking-wider">
                          {item.sku}
                        </td>
                        <td className="px-4 py-4">
                          {isOutOfStock ? (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/50">
                              Out of Stock
                            </span>
                          ) : item.stock <= (item.product.lowStockThreshold ?? 5) ? (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200/50 animate-pulse">
                              Low Stock ({item.stock})
                            </span>
                          ) : (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-sm">
                          {formatPrice(item.price)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {isOutOfStock ? (
                            <span className="text-xs text-rose-500 font-semibold">Notify when restocked</span>
                          ) : (
                            <div className="inline-flex items-center justify-center p-1 border border-emerald-950/10 rounded-2xl bg-white shadow-sm gap-1">
                              <button
                                onClick={() => handleQuantityChange(item.id, -1, item.stock)}
                                disabled={selectedQty === 0}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-900/60 hover:text-emerald-950 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                              >
                                <Minus size={13} strokeWidth={2.5} />
                              </button>
                              <span className="w-10 text-center font-bold text-xs font-mono select-none">
                                {selectedQty}
                              </span>
                              <button
                                onClick={() => handleQuantityChange(item.id, 1, item.stock)}
                                disabled={selectedQty >= item.stock}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-900/60 hover:text-emerald-950 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                              >
                                <Plus size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-extrabold text-sm">
                          {selectedQty > 0 ? formatPrice(subtotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List View */}
            <div className="block md:hidden space-y-4">
              {filteredRows.map((item) => {
                const selectedQty = quantities[item.id] ?? 0;
                const isOutOfStock = item.stock <= 0;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-3xl bg-white border border-emerald-950/5 shadow-sm space-y-3.5"
                  >
                    <div className="flex gap-3">
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-emerald-950/5 bg-[#faf9f2]">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center font-display font-black text-amber-800/20 text-xl">
                            {item.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Link href={`/products/${item.slug}`} className="font-semibold text-sm hover:text-[#a07010] transition-colors block line-clamp-1">
                          {item.name}
                        </Link>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {item.variantName && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200/50 uppercase tracking-wide">
                              {item.variantName}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#0b1c08]/40 uppercase tracking-wider font-semibold">
                            SKU: {item.sku}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-emerald-950/5">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-gray-400 font-semibold block uppercase">Price</span>
                        <span className="font-bold text-sm text-[#0b1c08]">{formatPrice(item.price)}</span>
                      </div>

                      {isOutOfStock ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200/50">
                          Out of Stock
                        </span>
                      ) : (
                        <div className="inline-flex items-center p-0.5 border border-emerald-950/10 rounded-xl bg-white shadow-sm gap-0.5">
                          <button
                            onClick={() => handleQuantityChange(item.id, -1, item.stock)}
                            disabled={selectedQty === 0}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-900/60 hover:text-emerald-950 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                          >
                            <Minus size={11} strokeWidth={2.5} />
                          </button>
                          <span className="w-8 text-center font-bold text-xs font-mono select-none">
                            {selectedQty}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item.id, 1, item.stock)}
                            disabled={selectedQty >= item.stock}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-900/60 hover:text-emerald-950 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                          >
                            <Plus size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 4. Sticky Bottom Checkout Panel */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="fixed bottom-0 inset-x-0 z-50 p-4 border-t border-emerald-950/10 shadow-[0_-12px_40px_rgba(11,28,8,0.15)] bg-white/80 backdrop-blur-md"
          >
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center justify-between sm:justify-start gap-6">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-[#0b1c08]/50 tracking-wider">
                    Total Order List
                  </span>
                  <p className="text-sm font-semibold text-[#0b1c08] flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
                  </p>
                </div>
                <div className="h-10 w-[1px] bg-[#0b1c08]/10 hidden sm:block" />
                <div className="space-y-0.5 text-right sm:text-left">
                  <span className="text-[10px] uppercase font-bold text-[#0b1c08]/50 tracking-wider">
                    Estimated Subtotal
                  </span>
                  <p className="text-lg font-black text-[#a07010] leading-none">
                    {formatPrice(totalAmount)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOrderWhatsApp}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-[#25d366] to-[#128c7e] hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  <WaIcon size={16} />
                  <span>Order on WhatsApp</span>
                </button>

                <button
                  disabled={addingToCart}
                  onClick={handleAddAllToCart}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold text-[#fff8f0] bg-[#0b1c08] hover:bg-[#1a2d17] hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-none transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  {addingToCart ? (
                    <Loader2 className="h-4 w-4 text-[#fff8f0] animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  <span>Add List to Cart</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
