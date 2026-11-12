/** Mirrors backend/src/modules/billing/channels.ts. A channel classifies the bill; it never decides the GSTR-1 section. */
export const CHANNELS = ['Transport Order', 'B2B Order', 'Home Delivery Order', 'Store Order'] as const;
export type SalesChannel = (typeof CHANNELS)[number];
export const PRICE_TIERS = ['B2B', 'Store/Retail'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const CHANNEL_TIER: Record<SalesChannel, PriceTier> = {
  'Transport Order': 'B2B',
  'B2B Order': 'B2B',
  'Home Delivery Order': 'Store/Retail',
  'Store Order': 'Store/Retail',
};

/** Customer's saved tag -> channel pre-selected on the bill (cashier can change it). */
const TAG_TO_CHANNEL: Record<string, SalesChannel> = {
  B2B: 'B2B Order', Wholesale: 'B2B Order', Transport: 'Transport Order',
  'Home Delivery': 'Home Delivery Order', 'Store/Retail': 'Store Order', Retail: 'Store Order',
};
const TAG_ORDER = ['Wholesale', 'B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Retail'];

export function channelForCustomer(tags: string[] = []): SalesChannel | '' {
  const t = TAG_ORDER.find(x => tags.includes(x));
  return t ? TAG_TO_CHANNEL[t] : '';
}

export const CHANNEL_COLORS: Record<string, string> = {
  'B2B Order': 'bg-blue-100 text-blue-700',
  'Transport Order': 'bg-orange-100 text-orange-700',
  'Home Delivery Order': 'bg-teal-100 text-teal-700',
  'Store Order': 'bg-purple-100 text-purple-700',
};
