'use client';
// Edit an existing bill in place (same bill, same invoice number). Every Edit action in Billing points here.
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/admin-access';
import { BillForm } from '@/app/billing/new/BillForm';
import { canEditBill, isEditableBill } from '@/components/billing/BillEditHistory';

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const access = useAdminAccess();
  // same query as the form and the invoice page: one request
  const { data: bill, isLoading, isError } = useQuery({ queryKey: ['billing-bill', id], queryFn: () => api.getBillingBill(id), staleTime: 0 });
  const back = () => router.push(`/billing/invoice/${id}`);

  const note = (msg: string) => (
    <div className="p-8 text-center text-sm text-gray-600">
      {msg} <button className="underline text-[#2d7a4f]" onClick={back}>Back to the bill</button>
    </div>
  );
  if (isLoading || access.isLoading) return <div className="p-8 text-center text-sm text-gray-400">Loading bill…</div>;
  if (isError || !bill) return note('This bill could not be loaded.');
  if (!canEditBill(access.can)) return note('You do not have permission to edit bills.');
  if (!isEditableBill(bill)) return note(`${bill.invoiceNo} is ${bill.status} and can no longer be edited.`);
  return <BillForm mode={bill.docType === 'SALE_ORDER' ? 'order' : 'bill'} editBillId={id} onExit={back} />;
}
