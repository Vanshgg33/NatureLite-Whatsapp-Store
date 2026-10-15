import { getStage, getOverdueMs, getWaitMs, STAGE_LABEL, STAGE_COLORS } from '@/lib/fms/stage';
import { fmtOverdue, fmtWait } from '@/lib/fms/format';

export function StageBadge({ req }: { req: any }) {
  if (req.status === 'SPLIT') {
    const needsPO = (req.items || []).filter((i: any) => !i.lineStatus || i.lineStatus === 'NEEDS_PO').length;
    const awaiting = (req.children || []).length;
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-fms-chip whitespace-nowrap font-jakarta" style={{ background: '#F5F3FF', color: '#4B3FAC' }}>
        {needsPO > 0 && <span style={{ color: '#8A4B06' }}>Needs PO · {needsPO}</span>}
        {needsPO > 0 && awaiting > 0 && <span className="opacity-40">|</span>}
        {awaiting > 0 && <span>Awaiting · {awaiting}</span>}
        {needsPO === 0 && awaiting === 0 && 'Split'}
      </span>
    );
  }
  const stage = getStage(req);
  const { bg, text } = STAGE_COLORS[stage];
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-fms-chip whitespace-nowrap font-jakarta"
      style={{ background: bg, color: text }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function WaitChip({ req }: { req: any }) {
  const stage = getStage(req);
  const now = Date.now();
  const overdueMs = getOverdueMs(req, stage, now);

  if (overdueMs !== null) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-fms-chip whitespace-nowrap font-jakarta" style={{ background: '#FDECEA', color: '#A3241A' }}>
        {fmtOverdue(overdueMs)}
      </span>
    );
  }

  const ms = getWaitMs(req, now);
  const days = ms / 86_400_000;
  const bg   = days < 4 ? '#EAF3EE' : days < 7 ? '#FDF3E3' : '#FDECEA';
  const text = days < 4 ? '#1E5E3F' : days < 7 ? '#8A4B06' : '#A3241A';
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-fms-chip whitespace-nowrap font-jakarta" style={{ background: bg, color: text }}>
      {fmtWait(ms)}
    </span>
  );
}
