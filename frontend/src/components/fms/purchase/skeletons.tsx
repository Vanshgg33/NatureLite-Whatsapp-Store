function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-fms-card border border-fms-line p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
          <Bone className="h-3 w-20 mb-3" />
          <Bone className="h-9 w-12" />
        </div>
      ))}
    </div>
  );
}

export function TableRowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="border-b">
          <td className="px-4 py-3"><Bone className="h-4 w-20" /></td>
          <td className="px-4 py-3"><Bone className="h-4 w-40" /></td>
          <td className="px-4 py-3"><Bone className="h-5 w-24 rounded-full" /></td>
          <td className="px-4 py-3"><Bone className="h-5 w-16 rounded-full" /></td>
          <td className="px-4 py-3"><Bone className="h-4 w-24" /></td>
          <td className="px-4 py-3"><Bone className="h-7 w-12 rounded-fms-control" /></td>
        </tr>
      ))}
    </>
  );
}

export function RequestCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-white rounded-fms-card border border-fms-line p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
          <div className="flex items-center justify-between mb-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-5 w-16 rounded-full" />
          </div>
          <Bone className="h-3 w-48 mb-1" />
          <Bone className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
