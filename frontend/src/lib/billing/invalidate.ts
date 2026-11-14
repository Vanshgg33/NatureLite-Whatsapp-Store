import type { QueryClient } from '@tanstack/react-query';

/** Queries are cached for 5 min; any bill/payment/cancel changes lists, dues, balances, dashboard and reports, so refresh all billing data. */
export const invalidateBilling = (qc: QueryClient) =>
  qc.invalidateQueries({ predicate: q => /^(billing|books)/.test(String(q.queryKey[0])) });
