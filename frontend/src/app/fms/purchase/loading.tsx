import { KpiStripSkeleton, TableRowSkeleton } from '@/components/fms/purchase/skeletons';

export default function Loading() {
  return (
    <div className="px-7 py-7 space-y-6">
      <div className="h-16 flex flex-col gap-2">
        <div className="animate-pulse h-8 w-56 bg-gray-200 rounded" />
        <div className="animate-pulse h-4 w-80 bg-gray-200 rounded" />
      </div>
      <KpiStripSkeleton />
      <div className="bg-white rounded-fms-card border border-fms-line overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
        <table className="min-w-full">
          <tbody><TableRowSkeleton rows={8} /></tbody>
        </table>
      </div>
    </div>
  );
}
