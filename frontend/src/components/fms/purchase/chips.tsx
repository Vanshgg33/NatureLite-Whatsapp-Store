import { getStage, getOverdueMs, getWaitMs, STAGE_LABEL, STAGE_COLORS } from '@/lib/fms/stage';
import { fmtOverdue, fmtWait } from '@/lib/fms/format';

export function StageBadge({ req }: { req: any }) {
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
