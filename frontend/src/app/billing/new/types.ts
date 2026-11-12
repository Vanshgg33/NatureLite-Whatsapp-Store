export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'cheque' | 'credit';
/** Rupees received at billing, per mode (new bills accept cash and UPI only). */
export interface PaidSplit { cash: number; upi: number }

export interface LineItem {
  _key: string;
  productId: string;
  name: string;
  sku: string;
  hsnCode: string;
  mrp: number;          // rupees (display)
  qty: number;
  unit: string;
  rate: number;         // rupees as entered
  priceInclTax: boolean;
  discountPct: number;
  gstRate: number;
  /** B2B / Store-Retail price of the product, so a channel change can re-price the line */
  tierPrices?: Record<string, number>;
  manualRate?: boolean;   // cashier typed the price: channel changes leave it alone
  missingTier?: string;   // tier whose price is not set: blocks Save
  // computed (paise):
  discountAmt: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface BillCharge {
  label: string;
  amtRupees: number;
}

export interface BillTotals {
  taxablePaise: number;
  billDiscAmtPaise: number;
  chargesTotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  igstTotalPaise: number;
  grandBeforePaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  amountDuePaise: number;
}

export interface GodownDto {
  _id: string;
  name: string;
  code: string;
  isDefault: boolean;
}
