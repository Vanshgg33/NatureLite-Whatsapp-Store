import { RDoc } from './docs';
import { StockMove } from './stock';

export interface PLine { productId?: string; name: string; hsn: string; qty: number; ratePct: number; treatment: string; taxable: number; cgst: number; sgst: number; igst: number }
export interface PDoc {
  id: string; docNo: string; supplierId: string; supplierName: string; supplierGstin: string; pos: string; date: Date;
  isDebitNote: boolean; cancelled: boolean; itc: 'ELIGIBLE' | 'INELIGIBLE_17_5' | 'OTHER_INELIGIBLE'; reverseCharge: boolean;
  lines: PLine[]; totalPaise: number; paidPaise: number; paymentMode: string;
}
export interface PayRec { id: string; type: 'IN' | 'OUT'; partyId: string; partyName: string; mode: string; amountPaise: number; discountPaise: number; accountId?: string; date: Date; status: string; clearedOn?: Date }
export interface ExpRec { date: Date; category: string; amountPaise: number; accountId?: string; mode: string; direct: boolean; isIncome: boolean }
export interface AcctRec { id: string; name: string; kind: 'CASH' | 'BANK' | 'WALLET'; openingBalancePaise: number }
export interface OpeningRec { asOn: Date; retainedEarningsPaise: number; partyOpenings: Array<{ partyId: string; name: string; balancePaise: number }>; modeAccountMap: Record<string, string> }
export interface ProdRec { id: string; name: string; sku: string; salePricePaise: number; purchasePricePaise: number }

export interface Books {
  docs: RDoc[]; purchases: PDoc[]; payments: PayRec[]; expenses: ExpRec[]; accounts: AcctRec[];
  opening: OpeningRec | null; moves: StockMove[]; products: ProdRec[]; stateCode: string;
}

export const toPDoc = (p: any): PDoc => ({
  id: String(p._id ?? ''), docNo: p.docNo, supplierId: String(p.supplierId ?? ''), supplierName: p.supplierName ?? '', supplierGstin: (p.supplierGstin ?? '').toUpperCase(),
  pos: String(p.stateOfSupply ?? '22'), date: new Date(p.date), isDebitNote: !!p.isDebitNote, cancelled: p.status === 'cancelled',
  itc: p.itcEligibility ?? 'ELIGIBLE', reverseCharge: !!p.reverseCharge,
  lines: (p.items ?? []).map((i: any): PLine => ({
    productId: i.productId ? String(i.productId) : undefined, name: i.name, hsn: String(i.hsnCode ?? ''), qty: Number(i.qty ?? 0), ratePct: Number(i.gstRate ?? 0),
    treatment: i.gstTreatment ?? (Number(i.gstRate) > 0 ? 'TAXABLE' : 'NIL_RATED'), taxable: Math.round(i.taxable ?? 0), cgst: Math.round(i.cgst ?? 0), sgst: Math.round(i.sgst ?? 0), igst: Math.round(i.igst ?? 0),
  })),
  totalPaise: Math.round(p.totalPaise ?? 0), paidPaise: Math.round(p.paidPaise ?? 0), paymentMode: String(p.paymentMode ?? 'cash').toLowerCase(),
});

export const toPayRec = (p: any): PayRec => ({
  id: String(p._id), type: p.type, partyId: String(p.partyId ?? ''), partyName: p.partyName ?? '', mode: String(p.mode ?? 'cash').toLowerCase(),
  amountPaise: Math.round(p.amountPaise ?? 0), discountPaise: Math.round(p.discountPaise ?? 0), accountId: p.accountId, date: new Date(p.date), status: p.status ?? 'CLEARED',
  clearedOn: p.clearedOn ? new Date(p.clearedOn) : undefined,
});
