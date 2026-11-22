/** Test stand-in for CashDrawerService when no store has a drawer switched on (today's behaviour). */
export const noDrawer = () => ({
  activeFor: async () => null,
  billHasTxns: async () => false,
  planSale: async () => null,
  planPayment: async () => null,
  planRefund: async () => null,
  withCash: (_plan: unknown, _meta: unknown, work: (s?: unknown) => unknown) => work(),
});
