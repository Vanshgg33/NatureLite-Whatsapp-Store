import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StageBadge, WaitChip } from './chips';
import { getStage, getOverdueMs, Stage } from '@/lib/fms/stage';
import { fmtDate, shortPr } from '@/lib/fms/format';
import { Button } from '@/components/ui/button';

interface Counts { open: number; completed: number; cancelled: number; all: number }

function filterByTab(requests: any[], tab: string): any[] {
  const OPEN = new Set(['NEEDS_PO','AWAITING_APPROVAL','AWAITING_DELIVERY','PARTLY_RECEIVED','READY_TO_CLOSE']);
  if (tab === 'open')      return requests.filter(r => OPEN.has(getStage(r)));
  if (tab === 'completed') return requests.filter(r => getStage(r) === 'CLOSED');
  if (tab === 'cancelled') return requests.filter(r => getStage(r) === 'CANCELLED');
  return requests;
}

function sortByUrgency(requests: any[]): any[] {
  const now = Date.now();
  return [...requests].sort((a, b) => {
    const ao = getOverdueMs(a, getStage(a), now) ?? -Infinity;
    const bo = getOverdueMs(b, getStage(b), now) ?? -Infinity;
    return bo > ao ? 1 : bo < ao ? -1 : 0;
  });
}

function ItemChips({ items }: { items: any[] }) {
  const max = 3;
  const visible = items.slice(0, max);
  const rest = items.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((i, idx) => (
        <span key={idx} className="text-[11px] px-1.5 py-0.5 rounded font-jakarta" style={{ background: '#F3F1EA', color: '#66706A' }}>
          {i.materialName} {i.qtyKg} {i.uom || 'kg'}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[11px] px-1.5 py-0.5 rounded border border-dashed font-jakarta" style={{ borderColor: '#DCD8CE', color: '#66706A' }}>
          +{rest} more
        </span>
      )}
    </div>
  );
}

export function RequestTable({
  requests,
  counts,
  stageFilter,
  onBoardToggle,
}: {
  requests: any[];
  counts: Counts;
  stageFilter: Stage | null;
  onBoardToggle: () => void;
}) {
  const filtered = stageFilter
    ? requests.filter(r => getStage(r) === stageFilter)
    : requests;

  const tabs = [
    { value: 'open',      label: 'Open',      count: counts.open },
    { value: 'completed', label: 'Completed',  count: counts.completed },
    { value: 'cancelled', label: 'Cancelled',  count: counts.cancelled },
    { value: 'all',       label: 'All',        count: counts.all },
  ];

  return (
    <Tabs defaultValue="open">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <TabsList>
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label} <span className="ml-1 opacity-60">{t.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          onClick={onBoardToggle}
          className="text-xs font-medium text-fms-muted hover:text-fms-ink font-jakarta px-3 py-1.5 rounded-fms-control border border-fms-line2 hover:border-fms-line transition-colors"
        >
          Board view →
        </button>
      </div>

      {tabs.map(({ value }) => (
        <TabsContent key={value} value={value}>
          <div className="bg-fms-surface rounded-fms-card border border-fms-line overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
            {filterByTab(filtered, value).length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-fms-muted font-jakarta">Nothing here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b" style={{ background: '#FAF9F5' }}>
                    <tr>
                      {['Request', 'Items', 'Stage', 'Waiting', 'Date', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fms-muted font-jakarta whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortByUrgency(filterByTab(filtered, value)).map((req: any) => {
                      const overdue = getOverdueMs(req, getStage(req)) !== null;
                      return (
                        <tr
                          key={req._id}
                          className={`border-b last:border-0 hover:bg-fms-subtle transition-colors ${overdue ? 'border-l-2' : ''}`}
                          style={overdue ? { borderLeftColor: '#A3241A' } : {}}
                        >
                          <td className="px-4 py-3 font-jetbrains text-[13px] font-semibold text-fms-ink whitespace-nowrap">
                            {shortPr(req.reqNo)}
                          </td>
                          <td className="px-4 py-3 max-w-[280px]">
                            <ItemChips items={req.items || []} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap"><StageBadge req={req} /></td>
                          <td className="px-4 py-3 whitespace-nowrap"><WaitChip req={req} /></td>
                          <td className="px-4 py-3 text-fms-muted text-xs font-jakarta whitespace-nowrap">{fmtDate(req.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/fms/purchase/${req._id}`}>
                              <Button variant="ghost" size="sm" className="text-xs font-jakarta rounded-fms-control">View</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
