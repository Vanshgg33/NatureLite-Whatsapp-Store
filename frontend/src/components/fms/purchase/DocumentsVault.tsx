'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { shortPr } from '@/lib/fms/format';
import { filterByRange } from '@/lib/fms/dateRange';
import { DateRangeFilter } from './DateRangeFilter';
import { useSearchParams } from 'next/navigation';

function fmtIST(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const TYPE_META: Record<string, { label: string; bg: string; text: string }> = {
  vendor_bill: { label: 'Vendor Bill', bg: '#EDF3FB', text: '#1F4F8A' },
  gate_bill:   { label: 'Gate Bill',   bg: '#EAF3EE', text: '#1E5E3F' },
};

export function DocumentsVault() {
  const params = useSearchParams();
  const range = params.get('range');

  const { data: rawDocs = [], isLoading } = useQuery({
    queryKey: ['purchase-documents'],
    queryFn: () => api.getPurchaseDocuments(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const docs = useMemo(
    () => filterByRange(rawDocs.map((d: any) => ({ ...d, createdAt: d.uploadedAt })), range),
    [rawDocs, range],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-7 w-7 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-fraunces text-xl font-semibold text-fms-ink">Documents</h2>
          <p className="text-xs text-fms-muted font-jakarta mt-0.5">{docs.length} file{docs.length !== 1 ? 's' : ''}</p>
        </div>
        <DateRangeFilter />
      </div>

      {docs.length === 0 ? (
        <div className="rounded-fms-card border border-dashed border-fms-line2 py-16 text-center">
          <FileText className="h-8 w-8 text-fms-muted mx-auto mb-2 opacity-40" />
          <p className="text-sm text-fms-muted font-jakarta">No documents in this range.</p>
        </div>
      ) : (
        <div className="bg-fms-surface rounded-fms-card border border-fms-line shadow-[0_1px_2px_rgba(24,33,28,.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: '#FAF9F5' }} className="border-b border-fms-line">
                  {['File', 'Request', 'Type', 'Uploaded by', 'Date & Time', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fms-muted font-jakarta whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc: any, i: number) => {
                  const meta = TYPE_META[doc.type] ?? TYPE_META.vendor_bill;
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-fms-subtle transition-colors pf-doc-row">
                      <td className="px-4 py-3 max-w-[260px]">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"
                          className="text-[#1E5E3F] hover:underline font-jakarta text-xs inline-flex items-center gap-1 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-fms-muted" />
                          <span className="truncate">{doc.name}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/fms/purchase/${doc.reqId}`}
                          className="font-jetbrains text-xs font-semibold text-[#1E5E3F] hover:underline">
                          {shortPr(doc.reqNo)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-jakarta"
                          style={{ background: meta.bg, color: meta.text }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-fms-muted font-jakarta whitespace-nowrap">
                        {doc.uploadedBy || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-fms-muted font-jakarta whitespace-nowrap">
                        {doc.uploadedAt ? fmtIST(doc.uploadedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/fms/purchase/${doc.reqId}`}>
                          <button className="text-xs font-jakarta text-fms-muted hover:text-fms-brand px-2 py-1 rounded transition-colors">
                            View PR
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
