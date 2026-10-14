export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'cheque' | 'credit';

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
