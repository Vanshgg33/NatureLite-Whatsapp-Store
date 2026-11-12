'use client';

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { ReportPage, DataTable, Stat } from '@/components/crm/ReportPage';

const when = (d: string) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });

export default function CrmFeedbackPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-feedback'], queryFn: () => api.getCrmFeedback() });
  return (
    <ReportPage title="Feedback" icon={Star} loading={isLoading} error={isError} note="Customer reviews and feedback already collected by the store. NPS surveys and auto-callbacks for detractors are not built.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Responses with a rating" value={data?.count ?? 0} />
        <Stat label="Average rating (1–5)" value={data?.avgRating ?? '—'} />
        <Stat label="Rated 1–2 stars" value={data?.lowRated ?? 0} />
        {[5, 4, 3].map(r => <Stat key={r} label={`${r} stars`} value={data?.byRating?.[r] ?? 0} />)}
      </div>
      <DataTable head={['Customer', 'Rating', 'Type', 'Message', 'Date']} empty="No feedback yet."
        rows={(data?.recent ?? []).map((f: any) => [f.user?.name || 'Guest', f.rating ?? '—', f.type, (f.message || '').slice(0, 120), when(f.createdAt)])} />
    </ReportPage>
  );
}
