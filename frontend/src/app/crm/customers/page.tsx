// frontend/src/app/crm/customers/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue, cn } from '@/lib/utils';

const SEGMENTS = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost'];

const SEG_COLORS: Record<string, string> = {
  'New': 'bg-blue-50 text-blue-700 border-blue-200',
  'Active': 'bg-green-50 text-green-700 border-green-200',
  'Due Soon': 'bg-amber-50 text-amber-700 border-amber-200',
  'Overdue': 'bg-red-50 text-red-700 border-red-200',
  'At Risk': 'bg-orange-50 text-orange-700 border-orange-200',
  'Dormant': 'bg-gray-100 text-gray-600 border-gray-200',
  'Lost': 'bg-gray-50 text-gray-400 border-gray-100',
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

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-[#D4A017]" /> Customers
        </h1>
      </div>

      <div className="p-5 space-y-4">
        {/* Search + segment filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {SEGMENTS.map(s => (
              <button
                key={s}
                onClick={() => setSegment(segment === s ? '' : s)}
                className={cn(
                  'text-[11px] px-2.5 py-1.5 rounded-full border font-medium transition-colors',
                  segment === s ? SEG_COLORS[s] : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.data ?? []).map((item: any) => (
              <button
                key={item._id}
                onClick={() => router.push(`/crm/customers/${item.userId}`)}
                className="w-full bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 hover:border-[#D4A017]/50 hover:bg-[#FAF7F2] transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-full bg-[#D4A017]/10 flex items-center justify-center text-[#7C5C1E] font-semibold text-sm flex-shrink-0">
                  {(item.user?.name ?? item.user?.phone ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">{item.user?.name ?? item.user?.phone}</span>
                    {item.isVip && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">VIP</span>}
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', SEG_COLORS[item.segment] ?? 'bg-gray-100')}>{item.segment}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.user?.phone} · LTV {fmt(item.ltv)} · {item.topCategory || '—'}</p>
                </div>
              </button>
            ))}
            {!data?.data?.length && <p className="text-center text-sm text-gray-400 py-16">No customers found</p>}
          </div>
        )}
      </div>
    </div>
  );
}
