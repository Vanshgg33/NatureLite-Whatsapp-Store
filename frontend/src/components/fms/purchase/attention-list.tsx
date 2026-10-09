import Link from 'next/link';
import { getStage, getOverdueMs, STAGE_LABEL, Stage } from '@/lib/fms/stage';
import { shortPr } from '@/lib/fms/format';

interface Alert {
  icon: string;
  title: string;
  body: string;
  actionLabel: string;
  href: string;
}

const OPEN_STAGES = new Set<Stage>(['NEEDS_PO','AWAITING_APPROVAL','AWAITING_DELIVERY','PARTLY_RECEIVED','READY_TO_CLOSE']);

export function buildAlerts(requests: any[]): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  // 1. Overdue
  for (const r of requests) {
    if (alerts.length >= 5) break;
    const stage = getStage(r);
    const ms = getOverdueMs(r, stage, now);
    if (ms !== null) {
      alerts.push({
        icon: '⏰',
        title: `${shortPr(r.reqNo)} overdue`,
        body: `${STAGE_LABEL[stage]} — ${Math.round(ms / 86_400_000)} days`,
        actionLabel: 'View',
        href: `/fms/purchase/${r._id}`,
      });
    }
  }

  // 2. Ready to close
  for (const r of requests) {
    if (alerts.length >= 5) break;
    if (getStage(r) === 'READY_TO_CLOSE') {
      alerts.push({
        icon: '✅',
        title: `${shortPr(r.reqNo)} is done but still open`,
        body: 'All goods received — close the request',
        actionLabel: 'Close request',
        href: `/fms/purchase/${r._id}`,
      });
    }
  }

  // 3. Same material in 2+ open requests
  if (alerts.length < 5) {
    const openReqs = requests.filter(r => OPEN_STAGES.has(getStage(r)));
    const matToReqs: Record<string, string[]> = {};
    for (const r of openReqs) {
      for (const item of (r.items || [])) {
        const key = item.materialName;
        if (!matToReqs[key]) matToReqs[key] = [];
        matToReqs[key].push(shortPr(r.reqNo));
      }
    }
    for (const mat of Object.keys(matToReqs)) {
      if (alerts.length >= 5) break;
      const unique = matToReqs[mat].filter((v, i, a) => a.indexOf(v) === i);
      if (unique.length >= 2) {
        alerts.push({
          icon: '🔁',
          title: `${mat} in ${unique.length} open requests`,
          body: unique.join(' · '),
          actionLabel: 'Merge',
          href: `/fms/purchase`,
        });
      }
    }
  }

  // 4. Missing required-by date
  if (alerts.length < 5) {
    const missing = requests.filter(r => OPEN_STAGES.has(getStage(r)) && !r.requiredBy).length;
    if (missing > 0) {
      alerts.push({
        icon: '📅',
        title: `${missing} open request${missing > 1 ? 's' : ''} have no required-by date`,
        body: 'Overdue tracking won\'t work without dates',
        actionLabel: 'Set dates',
        href: '/fms/purchase',
      });
    }
  }

  return alerts;
}

export function AttentionList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-fms-card border border-dashed border-fms-line2 p-8 text-center">
        <p className="text-sm text-fms-muted font-jakarta">No urgent items. All requests are on track.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className="flex items-start gap-3 bg-fms-surface rounded-fms-card border border-fms-line p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
          <div className="h-8 w-8 rounded-fms-control flex items-center justify-center shrink-0 text-base" style={{ background: '#FDF3E3' }}>
            {a.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-fms-ink font-jakarta">{a.title}</p>
            <p className="text-xs text-fms-muted font-jakarta mt-0.5">{a.body}</p>
          </div>
          <Link href={a.href} className="shrink-0">
            <button className="text-xs font-medium font-jakarta px-3 py-1.5 rounded-fms-control border border-fms-line2 hover:border-fms-brand hover:text-fms-brand transition-colors text-fms-muted whitespace-nowrap">
              {a.actionLabel}
            </button>
          </Link>
        </div>
      ))}
    </div>
  );
}

export function CategoryMix({ mix }: { mix: { category: string; kg: number }[] }) {
  if (!mix.length) {
    return (
      <div className="rounded-fms-card border border-dashed border-fms-line2 p-6 text-center">
        <p className="text-xs text-fms-muted font-jakarta">Category breakdown available after material backfill.</p>
      </div>
    );
  }
  const max = mix[0].kg;
  return (
    <div className="space-y-2.5">
      {mix.map(({ category, kg }) => (
        <div key={category} className="flex items-center gap-3">
          <p className="text-xs text-fms-muted font-jakarta w-28 truncate shrink-0">{category}</p>
          <div className="flex-1 h-2 rounded-full bg-fms-sunken overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(kg / max) * 100}%`, background: '#1E5E3F' }} />
          </div>
          <p className="text-xs font-jetbrains text-fms-ink w-16 text-right shrink-0">{kg.toLocaleString('en-IN')} kg</p>
        </div>
      ))}
    </div>
  );
}
