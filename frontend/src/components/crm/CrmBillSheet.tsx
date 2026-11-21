'use client';

// The Billing module's own New Bill form, opened over a CRM customer profile with that customer fixed.
// Same component, same API (/billing/bills/v1), so the bill is an ordinary Billing invoice in every respect.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { BillForm } from '@/app/billing/new/BillForm';
import { useAdminAccess } from '@/lib/admin-access';
import { useAdminAuthStore } from '@/lib/admin-store';

/** Mirrors the server: billing endpoints need billing_new.view + create, and RolesGuard only lets
 *  these departments (or staff with no department) reach the billing controller. */
const BILLING_DEPTS = ['crm_head', 'crm_senior', 'fms'];
export function useCanBillFromCrm() {
  const access = useAdminAccess();
  const dept = useAdminAuthStore((s) => s.user?.departmentType);
  return !access.isLoading && access.can('billing_new.view') && access.can('billing_new.create') && (!dept || BILLING_DEPTS.includes(dept));
}

export function CrmBillSheet({ open, customerId, onClose }: { open: boolean; customerId: string; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the profile underneath must not scroll with the bill
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const refreshCrm = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('crm') });

  const onSaved = (bill: any, { print }: { print: boolean }) => {
    refreshCrm();
    // the CRM engine recomputes LTV / AOV / segments just after the bill is saved; pick that up too
    setTimeout(refreshCrm, 2500);
    onClose();
    if (print && !window.open(`/billing/invoice/${bill._id}?print=1`, '_blank')) router.push(`/billing/invoice/${bill._id}?print=1`);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="crm-bill"
          aria-label="New bill"
          className="fixed inset-0 z-[60] bg-white overflow-y-auto overscroll-contain"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* closing also refreshes: bills made with Save & New keep the sheet open */}
          <BillForm presetCustomerId={customerId} onExit={() => { refreshCrm(); onClose(); }} onSaved={onSaved} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
