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

export const denomLabel = (d: DrawerDenom) => `₹${d.value}${d.value === 10 || d.value === 20 ? (d.kind === 'coin' ? ' coin' : ' note') : ''}`;

/** "12a" / "₹500" / "-3" / "1e9" -> a whole number 0..99999 */
export const toQty = (s: string) => Math.min(99999, Number(String(s).replace(/\D/g, '').slice(0, 5)) || 0);

/** server error shape: { message, code, details } */
export const apiErrorCode = (e: any): { code?: string; details?: any } => ({ code: e?.response?.data?.code, details: e?.response?.data?.details });

export const fmtCounts = (c: Counts, denoms: DrawerDenom[]) =>
  denoms.filter(d => c[d.id]).map(d => `${c[d.id]}×${denomLabel(d)}`).join(' + ') || 'nothing';
