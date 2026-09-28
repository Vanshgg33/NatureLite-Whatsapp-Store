'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Users, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue, cn } from '@/lib/utils';

const SEGMENTS = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost'];

const SEG: Record<string, { bg: string; color: string; dot: string }> = {
  'New':      { bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' },
  'Active':   { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  'Due Soon': { bg: '#FEFCE8', color: '#92400E', dot: '#F59E0B' },
  'Overdue':  { bg: '#FEF2F2', color: '#991B1B', dot: '#EF4444' },
  'At Risk':  { bg: '#FFF7ED', color: '#9A3412', dot: '#F97316' },
  'Dormant':  { bg: '#F9FAFB', color: '#6B7280', dot: '#9CA3AF' },
  'Lost':     { bg: '#F3F4F6', color: '#9CA3AF', dot: '#D1D5DB' },
};

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const dSearch = useDebouncedValue(search, 350);

  const { data, isLoading } = useQuery({
    queryKey: ['crm-customers', segment, dSearch],
    queryFn: () => api.getCrmCustomers({ segment: segment || undefined, search: dSearch || undefined }),
  });

  const items: any[] = data?.data ?? [];

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      {/* Header */}
      <div className="bg-white px-7 py-5" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2.5" style={{ color: '#1C1917' }}>
              <Users className="h-5 w-5" style={{ color: '#D4A017' }} />
              Customers
            </h1>
            <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>
              {isLoading ? 'Loading…' : `${data?.total ?? 0} total customers`}
            </p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#A09A93' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13px] focus:outline-none transition-all"
              style={{ border: '1px solid #E8E2D9', background: '#F7F5F0', color: '#1C1917' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#D4A017')}
              onBlur={e => (e.currentTarget.style.borderColor = '#E8E2D9')}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-medium mr-1" style={{ color: '#A09A93' }}>
              <SlidersHorizontal className="h-3 w-3" /> Segment:
            </span>
            <button
              onClick={() => setSegment('')}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={!segment
                ? { background: '#1A3625', color: '#D4A017' }
                : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
            >
              All
            </button>
            {SEGMENTS.map(s => {
              const seg = SEG[s];
              return (
                <button
                  key={s}
                  onClick={() => setSegment(segment === s ? '' : s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={segment === s
                    ? { background: seg.bg, color: seg.color, border: `1.5px solid ${seg.dot}50` }
                    : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: segment === s ? seg.dot : '#D1D5DB' }} />
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table header */}
      <div className="px-7 pt-5">
        <div
          className="grid text-[10px] font-bold uppercase tracking-[0.15em] px-4 pb-2"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', color: '#A09A93' }}
        >
          <span>Customer</span>
          <span>Segment</span>
          <span>LTV</span>
          <span className="hidden sm:block">Top Product</span>
          <span className="text-right"></span>
        </div>
      </div>

      {/* List */}
      <div className="px-7 pb-7 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !items.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#F0EDE7' }}>
              <Users className="h-6 w-6" style={{ color: '#A09A93' }} />
            </div>
            <p className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>No customers found</p>
            <p className="text-[13px] mt-1" style={{ color: '#A09A93' }}>Try adjusting your filters</p>
          </div>
        ) : items.map((item: any) => {
          const seg = SEG[item.segment];
          return (
            <button
              key={String(item.userId ?? item._id)}
              onClick={() => router.push(`/crm/customers/${item.userId}`)}
              className="w-full bg-white rounded-xl px-4 py-3.5 text-left transition-all group crm-count-in"
              style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#D4A017';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(212,160,23,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#E8E2D9';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
              }}
            >
              <div className="grid items-center gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                {/* Customer */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                    style={{ background: seg ? `${seg.dot}18` : '#F0EDE7', color: seg ? seg.color : '#7C5C1E' }}
                  >
                    {(item.user?.name ?? item.user?.phone ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] truncate" style={{ color: '#1C1917' }}>
                      {item.user?.name ?? item.user?.phone ?? '—'}
                    </p>
                    <p className="text-[11px] font-mono truncate" style={{ color: '#A09A93' }}>{item.user?.phone}</p>
                  </div>
                  {item.isVip && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#FEF3C7', color: '#92400E' }}>VIP</span>}
                </div>

                {/* Segment */}
                <div>
                  {item.segment ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: seg?.bg ?? '#F9FAFB', color: seg?.color ?? '#6B7280' }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: seg?.dot ?? '#9CA3AF' }} />
                      {item.segment}
                    </span>
                  ) : (
                    <span className="text-[12px]" style={{ color: '#D1D5DB' }}>—</span>
                  )}
                </div>

                {/* LTV */}
                <p className="text-[13px] font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1A3625' }}>{fmt(item.ltv ?? 0)}</p>

                {/* Top product */}
                <p className="text-[12px] truncate hidden sm:block" style={{ color: '#6B6560' }}>{item.topProduct || item.topCategory || '—'}</p>

                {/* Arrow */}
                <div className="flex justify-end">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: '#F7F5F0' }}>
                    <ChevronRight className="h-3.5 w-3.5" style={{ color: '#7C5C1E' }} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
