'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import * as xlsx from 'xlsx';

function exportToExcel(products: any[]) {
  const rows = products.map((p: any) => ({
    Name: p.name,
    SKU: p.sku,
    Price: p.price,
    MRP: p.compareAtPrice ?? p.price,
    Stock: p.stock ?? 0,
    Tags: (p.tags ?? []).join(', '),
  }));
  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Products');
  xlsx.writeFile(wb, 'crm-products.xlsx');
}

export default function CrmProductsPage() {
  const [search, setSearch] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-products'],
    queryFn: () => api.getCrmProducts(),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return data as any[];
    const q = search.toLowerCase();
    return (data as any[]).filter((p: any) =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 pt-5 pb-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <Package className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
              <h1
                className="text-[20px] font-semibold"
                style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
              >
                Products
              </h1>
              <span
                className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--crm-sand)', color: 'var(--crm-muted)' }}
              >
                {(data as any[]).length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}
              >
                <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--crm-muted)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or SKU…"
                  className="bg-transparent text-[13px] focus:outline-none w-48"
                  style={{ color: 'var(--crm-ink)' }}
                />
              </div>
              <button
                onClick={() => exportToExcel(filtered)}
                disabled={!filtered.length}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium disabled:opacity-40 transition-opacity hover:opacity-80"
                style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="p-7">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="h-10 w-10 mb-4" style={{ color: 'var(--crm-line)' }} />
            <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>
              {search ? 'No matches' : 'No products'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((p: any) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product: p }: { product: any }) {
  const img = p.images?.[0];
  return (
    <div
      className="crm-card-v2 overflow-hidden flex flex-col"
      style={{ cursor: 'default' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full aspect-square flex items-center justify-center overflow-hidden"
        style={{ background: 'var(--crm-sand)', borderBottom: '1px solid var(--crm-line)' }}
      >
        {img ? (
          <img
            src={img}
            alt={p.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Package className="h-10 w-10" style={{ color: 'var(--crm-line)' }} />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--crm-ink)' }}>
          {p.name}
        </p>
        <p className="text-[11px] font-mono" style={{ color: 'var(--crm-muted)' }}>{p.sku}</p>
        <div className="flex items-center justify-between mt-auto pt-1.5">
          <p
            className="text-[14px] font-semibold crm-tabular"
            style={{ color: 'var(--crm-forest)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
          >
            {formatINR(p.price)}
          </p>
          {p.stock !== undefined && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={p.stock <= 0
                ? { background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)' }
                : { background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }
              }
            >
              {p.stock <= 0 ? 'OOS' : `${p.stock} left`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
