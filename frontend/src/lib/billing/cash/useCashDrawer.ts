'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Counts } from './cashChange';
import type { CashDrawer } from './drawer';

export const cashDrawerKey = (storeId?: string) => ['cash-drawer', storeId ?? ''];

/** the store's drawer, fetched as soon as the store is known (not at Save) and refreshed on focus */
export function useCashDrawer(storeId?: string, enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: cashDrawerKey(storeId),
    queryFn: () => api.getCashDrawer(storeId!),
    enabled: enabled && !!storeId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  return {
    ...q,
    drawer: q.data?.drawer ?? null,
    refresh: () => qc.invalidateQueries({ queryKey: cashDrawerKey(storeId) }),
    /** a 409 carries the drawer's real counts: show them at once so the plan is recomputed */
    setCounts: (counts: Counts) => qc.setQueryData(cashDrawerKey(storeId), (old: { drawer: CashDrawer | null } | undefined) =>
      old?.drawer ? { drawer: { ...old.drawer, counts } } : old),
  };
}
