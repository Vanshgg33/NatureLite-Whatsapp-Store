import Link from 'next/link';
import { getStage, getOverdueMs, getWaitMs, STAGE_LABEL, STAGE_COLORS } from '@/lib/fms/stage';
import { fmtOverdue, fmtWait, shortPr } from '@/lib/fms/format';

export function RequestCard({ req }: { req: any }) {
  const stage = getStage(req);
  const now = Date.now();
  const overdueMs = getOverdueMs(req, stage, now);
  const waitingMs = getWaitMs(req, now);
  const { bg, text } = STAGE_COLORS[stage];

  const items: { materialName: string; qtyKg: number; uom?: string }[] = req.items || [];
  const title = items.slice(0, 2).map(i => i.materialName).join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');
  const totalKg = items.reduce((s, i) => s + (i.qtyKg || 0), 0);

  return (
    <Link href={`/fms/purchase/${req._id}`}>
      <div
        className="bg-fms-surface rounded-fms-card border p-4 hover:shadow-md transition-shadow cursor-pointer"
        style={{
          borderColor: overdueMs !== null ? '#F3C7C2' : '#ECE9E1',
          borderLeftWidth: overdueMs !== null ? 3 : 1,
          borderLeftColor: overdueMs !== null ? '#A3241A' : '#ECE9E1',
          boxShadow: '0 1px 2px rgba(24,33,28,.06)',
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-jetbrains text-[13px] font-semibold text-fms-ink">{shortPr(req.reqNo)}</span>
          {overdueMs !== null ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-jakarta shrink-0" style={{ background: '#FDECEA', color: '#A3241A' }}>
              {fmtOverdue(overdueMs)}
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-jakarta shrink-0" style={{ background: bg, color: text }}>
              {fmtWait(waitingMs)}
            </span>
          )}
        </div>
        <p className="text-sm text-fms-ink font-jakarta font-medium truncate mb-1">{title || '—'}</p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-fms-muted font-jakarta">
            {items.length} item{items.length !== 1 ? 's' : ''} · {totalKg.toLocaleString('en-IN')} kg
          </p>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-jakarta" style={{ background: bg, color: text }}>
            {STAGE_LABEL[stage]}
          </span>
        </div>
      </div>
    </Link>
  );
}
