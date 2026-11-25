import type { Counts, DenomDef } from './cashChange';

export type DrawerDenom = DenomDef & { active: boolean; minLevel: number };

export interface CashDrawer {
  id: string;
  storeId: string;
  name: string;
  mode: 'OFF' | 'SOFT' | 'HARD';
  denoms: DrawerDenom[];
  counts: Counts;
  totalRupees: number;
  version: number;
  initialised: boolean;
  initialisedAt?: string;
  lastReconciledAt?: string;
  lowStock: string[];
  uncountedSales: number;
}

/** what a bill / payment / cancel sends when the store's drawer is on */
export type CashBlock = { received?: Counts; returned?: Counts; skip?: { reason: string } };

/** the drawer bills must count into, or null (none, not counted yet, or OFF = today's behaviour) */
export const activeDrawer = (d?: CashDrawer | null) => (d && d.initialised && d.mode !== 'OFF' ? d : null);

/** the notes and coins a store counts by default (same set as the server's DEFAULT_DENOMS, active ones) */
const DEFAULT_DENOMS: DrawerDenom[] = [
  ['N500', 500, 'note'], ['N200', 200, 'note'], ['N100', 100, 'note'], ['N50', 50, 'note'], ['N20', 20, 'note'], ['N10', 10, 'note'],
  ['C10', 10, 'coin'], ['C5', 5, 'coin'], ['C2', 2, 'coin'], ['C1', 1, 'coin'],
].map(([id, value, kind]) => ({ id: id as string, value: value as number, kind: kind as 'note' | 'coin', par: 0, active: true, minLevel: 0 }));

/**
 * For a store whose drawer is off or not set up: lets the cashier still count the cash received and see the change,
 * without booking anything into a drawer. The till is not tracked, so change is planned as if every note is at hand.
 */
export function countOnlyDrawer(denoms?: DrawerDenom[]): CashDrawer {
  const ds = denoms?.some(d => d.active) ? denoms : DEFAULT_DENOMS;
  return {
    id: 'count-only', storeId: '', name: 'Count only', mode: 'SOFT', denoms: ds, version: 0, initialised: false,
    counts: Object.fromEntries(ds.map(d => [d.id, 99999])), totalRupees: 0, lowStock: [], uncountedSales: 0,
  };
}

export const denomLabel =(d: DrawerDenom) => `₹${d.value}${d.value === 10 || d.value === 20 ? (d.kind === 'coin' ? ' coin' : ' note') : ''}`;

/** "12a" / "₹500" / "-3" / "1e9" -> a whole number 0..99999 */
export const toQty = (s: string) => Math.min(99999, Number(String(s).replace(/\D/g, '').slice(0, 5)) || 0);

/** server error shape: { message, code, details } */
export const apiErrorCode = (e: any): { code?: string; details?: any } => ({ code: e?.response?.data?.code, details: e?.response?.data?.details });

export const fmtCounts = (c: Counts, denoms: DrawerDenom[]) =>
  denoms.filter(d => c[d.id]).map(d => `${c[d.id]}×${denomLabel(d)}`).join(' + ') || 'nothing';
