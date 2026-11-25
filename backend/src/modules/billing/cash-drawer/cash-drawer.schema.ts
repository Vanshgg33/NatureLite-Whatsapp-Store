import { Schema } from 'mongoose';

export const DEFAULT_DENOMS = [
  { id: 'N2000', value: 2000, kind: 'note', par: 0, active: false, minLevel: 0 },
  { id: 'N500', value: 500, kind: 'note', par: 10, active: true, minLevel: 2 },
  { id: 'N200', value: 200, kind: 'note', par: 10, active: true, minLevel: 2 },
  { id: 'N100', value: 100, kind: 'note', par: 30, active: true, minLevel: 10 },
  { id: 'N50', value: 50, kind: 'note', par: 30, active: true, minLevel: 10 },
  { id: 'N20', value: 20, kind: 'note', par: 40, active: true, minLevel: 10 },
  { id: 'N10', value: 10, kind: 'note', par: 40, active: true, minLevel: 10 },
  { id: 'C20', value: 20, kind: 'coin', par: 0, active: false, minLevel: 0 },
  { id: 'C10', value: 10, kind: 'coin', par: 40, active: true, minLevel: 10 },
  { id: 'C5', value: 5, kind: 'coin', par: 40, active: true, minLevel: 10 },
  { id: 'C2', value: 2, kind: 'coin', par: 40, active: true, minLevel: 10 },
  { id: 'C1', value: 1, kind: 'coin', par: 40, active: true, minLevel: 10 },
] as const;

const DenomSchema = new Schema(
  { id: String, value: Number, kind: { type: String, enum: ['note', 'coin'] }, par: Number, active: Boolean, minLevel: Number },
  { _id: false },
);

/** ONE document per physical drawer (one per store). counts is the cached running balance of the ledger. */
export const CashDrawerSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true, unique: true },
    name: { type: String, default: 'Main drawer' },
    mode: { type: String, enum: ['OFF', 'SOFT', 'HARD'], default: 'OFF' },
    denoms: { type: [DenomSchema], default: () => DEFAULT_DENOMS.map(d => ({ ...d })) },
    counts: { type: Object, default: {} }, // { N500: 12, C1: 80 } never negative
    version: { type: Number, default: 0 }, // +1 on every txn; equals the last txn seq
    initialisedAt: Date,
    lastReconciledAt: Date,
  },
  { timestamps: true, minimize: false, collection: 'billing_cash_drawers' },
);

export const TXN_TYPES = [
  'OPENING_COUNT', 'BILL_SALE', 'BILL_PAYMENT', 'BILL_REFUND', 'UNCOUNTED_SALE',
  'DEPOSIT', 'WITHDRAWAL', 'REPLENISH', 'RECONCILE', 'ADJUSTMENT',
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

/** APPEND-ONLY ledger. Corrections are new rows. */
export const CashDrawerTxnSchema = new Schema(
  {
    drawerId: { type: Schema.Types.ObjectId, required: true },
    storeId: { type: Schema.Types.ObjectId, required: true },
    seq: { type: Number, required: true }, // = drawer.version after this txn
    type: { type: String, enum: TXN_TYPES, required: true },
    billId: { type: Schema.Types.ObjectId },
    invoiceNo: String,
    received: { type: Object, default: {} }, // pieces that came IN
    returned: { type: Object, default: {} }, // pieces that went OUT
    delta: { type: Object, default: {} }, // received - returned, per denomination
    netRupees: { type: Number, required: true },
    billTotalRupees: Number, // sale rows: the invoice total
    cashDueRupees: Number, // bill/payment rows: what the cash had to cover (received - change = this)
    balanceAfter: { type: Object, required: true },
    clientRequestId: String,
    reason: String,
    createdBy: { userId: String, name: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false, collection: 'billing_cash_drawer_txns' },
);
CashDrawerTxnSchema.index({ drawerId: 1, seq: 1 }, { unique: true });
CashDrawerTxnSchema.index(
  { drawerId: 1, clientRequestId: 1, type: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);
CashDrawerTxnSchema.index({ billId: 1 });
CashDrawerTxnSchema.index({ drawerId: 1, createdAt: -1 });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  CashDrawerTxnSchema.pre(op as any, function () {
    throw new Error('CashDrawerTxn is append-only');
  });
}
