'use client';
import { History } from 'lucide-react';
import { BillEditHistory } from '@/components/billing/BillEditHistory';

export default function BillEditHistoryPage() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><History className="h-5 w-5 text-[#2d7a4f]" /> Bill Edit History</h1>
        <p className="text-xs text-gray-500 mt-0.5">Every saved edit to an invoice or sale order: who, when and what changed (latest 100).</p>
      </div>
      <BillEditHistory showBill />
    </div>
  );
}
