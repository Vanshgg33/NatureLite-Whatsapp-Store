import { Pill, type PillVariant } from './Pill';

/** Payment status of a store bill; a cancelled bill or a credit note (return/refund) says so instead. */
export function BillStatusPill({ bill }: { bill: { status?: string; docType?: string; paymentStatus?: string } }) {
  const [variant, label]: [PillVariant, string] =
    bill.status === 'cancelled' ? ['neutral', 'Cancelled']
    : bill.docType === 'CREDIT_NOTE' ? ['upcoming', 'Return / Refund']
    : bill.paymentStatus === 'paid' ? ['success', 'Paid']
    : bill.paymentStatus === 'partial' ? ['warn', 'Partial']
    : ['danger', 'Unpaid'];
  return <Pill variant={variant}>{label}</Pill>;
}
