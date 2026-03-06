'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard } from '@/components/ecommerce/product-card';
import { api } from '@/lib/api';
import { Product, Category } from '@/types';
import { cn } from '@/lib/utils';

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'popular', label: 'Most Popular' },
];

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories', 'active'],
    queryFn: () => api.getActiveCategories(),
  });

  // Fetch products
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, selectedCategory, sortBy, minPrice, maxPrice, inStockOnly],
    queryFn: () => {
      let sortField: string | undefined;
      let sortOrder: 'asc' | 'desc' | undefined;

      if (sortBy === 'newest') {
        sortField = 'createdAt';
        sortOrder = 'desc';
      } else if (sortBy === 'price-asc') {
        sortField = 'price';
        sortOrder = 'asc';
      } else if (sortBy === 'price-desc') {
        sortField = 'price';
        sortOrder = 'desc';
      } else if (sortBy === 'popular') {
        sortField = 'totalSold';
        sortOrder = 'desc';
      }

      return api.getProducts({
        page,
        limit: 12,
        search: search || undefined,
        category: selectedCategory || undefined,
        isActive: true,
        inStock: inStockOnly || undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        sortBy: sortField,
        sortOrder,
      });
    },
  });

  const products = productsData?.items || [];
  const totalPages = productsData?.totalPages || 1;

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory(null);
    setSortBy('newest');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setPage(1);
  };

  const hasActiveFilters =
    !!search ||
    !!selectedCategory ||
    sortBy !== 'newest' ||
    !!minPrice ||
    !!maxPrice ||
    inStockOnly;

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-brand-charcoal mb-2">
            Our Products
          </h1>
          <p className="font-body text-lg text-brand-muted">
            Pure, traditional oils and ghee for your kitchen
          </p>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
            <Input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-12 py-6 bg-white border-0 rounded-xl shadow-brand-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-brand-sand rounded-full"
              >
                <X className="w-4 h-4 text-brand-muted" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="appearance-none px-4 py-3 pr-10 bg-white border-0 rounded-xl shadow-brand-sm font-body text-brand-charcoal cursor-pointer"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted pointer-events-none" />
          </div>

          {/* Filter Toggle (Mobile) */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(true)}
            className="lg:hidden"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {selectedCategory && (
              <span className="ml-1 w-5 h-5 rounded-full bg-brand-mustard text-white text-xs flex items-center justify-center">
                1
              </span>
            )}
          </Button>
        </div>

        {/* Mobile Filter Drawer */}
        <AnimatePresence>
          {showFilters && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 z-40 lg:hidden"
                onClick={() => setShowFilters(false)}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl lg:hidden overflow-y-auto"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-display text-lg font-semibold text-brand-charcoal">
                      Filters
                    </h3>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="p-2 rounded-full hover:bg-brand-sand transition-colors"
                    >
                      <X className="w-5 h-5 text-brand-muted" />
                    </button>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-body text-sm font-medium text-brand-muted uppercase tracking-wider mb-3">
                      Categories
                    </h4>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          setSelectedCategory(null);
                          setPage(1);
                          setShowFilters(false);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 rounded-lg font-body text-sm transition-colors',
                          selectedCategory === null
                            ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                            : 'text-brand-text hover:bg-brand-sand'
                        )}
                      >
                        All Products
                      </button>
                      {categories?.map((category: Category) => (
                        <button
                          key={category._id}
                          onClick={() => {
                            setSelectedCategory(category._id);
                            setPage(1);
                            setShowFilters(false);
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2.5 rounded-lg font-body text-sm transition-colors',
                            selectedCategory === category._id
                              ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                              : 'text-brand-text hover:bg-brand-sand'
                          )}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-body text-sm font-medium text-brand-muted uppercase tracking-wider mb-3">
                      Price range
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="Min"
                        value={minPrice}
                        onChange={(e) => {
                          setMinPrice(e.target.value);
                          setPage(1);
                        }}
                        className="h-10"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="Max"
                        value={maxPrice}
                        onChange={(e) => {
                          setMaxPrice(e.target.value);
                          setPage(1);
                        }}
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="inline-flex items-center gap-2 font-body text-sm text-brand-text">
                      <input
                        type="checkbox"
                        checked={inStockOnly}
                        onChange={(e) => {
                          setInStockOnly(e.target.checked);
                          setPage(1);
                        }}
                        className="rounded border-brand-sand text-brand-mustard focus:ring-brand-mustard"
                      />
                      In stock only
                    </label>
                  </div>

                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        clearFilters();
                        setShowFilters(false);
                      }}
                      className="w-full"
                    >
                      Clear All Filters
                    </Button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex gap-8">
          {/* Desktop Sidebar Filters */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-2xl p-6 shadow-brand-sm sticky top-28">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-lg font-semibold text-brand-charcoal">
                  Categories
                </h3>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="font-body text-sm text-brand-mustard hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setPage(1);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 rounded-lg font-body text-sm transition-colors',
                    selectedCategory === null
                      ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                      : 'text-brand-text hover:bg-brand-sand'
                  )}
                >
                  All Products
                </button>
                {categories?.map((category: Category) => (
                  <button
                    key={category._id}
                    onClick={() => {
                      setSelectedCategory(category._id);
                      setPage(1);
                    }}
                    className={cn(
                      'w-full text-left px-4 py-2.5 rounded-lg font-body text-sm transition-colors',
                      selectedCategory === category._id
                        ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                        : 'text-brand-text hover:bg-brand-sand'
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              <div className="mt-8 border-t pt-6 space-y-4">
                <h4 className="font-display text-sm font-semibold text-brand-charcoal">
                  Price range
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Min"
                    value={minPrice}
                    onChange={(e) => {
                      setMinPrice(e.target.value);
                      setPage(1);
                    }}
                    className="h-10"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Max"
                    value={maxPrice}
                    onChange={(e) => {
                      setMaxPrice(e.target.value);
                      setPage(1);
                    }}
                    className="h-10"
                  />
                </div>

                <label className="inline-flex items-center gap-2 font-body text-sm text-brand-text">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => {
                      setInStockOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-brand-sand text-brand-mustard focus:ring-brand-mustard"
                  />
                  In stock only
                </label>
              </div>
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl overflow-hidden animate-pulse"
                  >
                    <div className="aspect-square bg-brand-sand" />
                    <div className="p-5 space-y-3">
                      <div className="h-4 bg-brand-sand rounded w-16" />
                      <div className="h-5 bg-brand-sand rounded w-3/4" />
                      <div className="h-4 bg-brand-sand rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <motion.div
                className="text-center py-16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p className="font-body text-lg text-brand-muted mb-4">
                  No products found
                </p>
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="border-brand-charcoal"
                >
                  Clear filters
                </Button>
              </motion.div>
            ) : (
              <>
                <p className="font-body text-sm text-brand-muted mb-4">
                  Showing {products.length} product{products.length !== 1 ? 's' : ''}
                  {productsData?.total ? ` of ${productsData.total}` : ''}
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product: Product, index: number) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      index={index}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-12">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="px-4 font-body text-sm text-brand-muted">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
