export const productTotal = (p: { stock?: number; variants?: { stock?: number }[] }): number =>
  p.variants?.length ? p.variants.reduce((a, v) => a + (v.stock ?? 0), 0) : (p.stock ?? 0);

export const storeTotal = (s: { stock?: number; variantStocks?: { stock?: number }[] }): number =>
  s.variantStocks?.length ? s.variantStocks.reduce((a, v) => a + (v.stock ?? 0), 0) : (s.stock ?? 0);
