/** Sales channel = the 4 bill categories. Stored on the bill as `orderTag`. Never decides the GSTR-1 section. */
export const CHANNELS = ['Transport Order', 'B2B Order', 'Home Delivery Order', 'Store Order'] as const;
export type SalesChannel = (typeof CHANNELS)[number];

/** Only two price tiers exist; these are the BillingTagPrice.tag values. */
export const PRICE_TIERS = ['B2B', 'Store/Retail'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const CHANNEL_TIER: Record<SalesChannel, PriceTier> = {
  'Transport Order': 'B2B',
  'B2B Order': 'B2B',
  'Home Delivery Order': 'Store/Retail',
  'Store Order': 'Store/Retail',
};

/** Old six order tags -> channels (blueprint D9). */
export const LEGACY_TAG_TO_CHANNEL: Record<string, SalesChannel> = {
  B2B: 'B2B Order',
  Wholesale: 'B2B Order',
  Transport: 'Transport Order',
  'Home Delivery': 'Home Delivery Order',
  'Store/Retail': 'Store Order',
  Retail: 'Store Order',
};

export const isChannel = (v: unknown): v is SalesChannel => (CHANNELS as readonly string[]).includes(v as string);
