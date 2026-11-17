'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** Sentinel <option> value for the "+ Add New Vendor" entry in vendor selects. */
export const ADD_VENDOR_VALUE = '__add_new_vendor__';

/** Address line copied onto a PO when a vendor is picked. */
export const vendorAddressLine = (v: any) =>
  [v.address, v.city, [v.state, v.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');

type Form = {
  name: string; contactPerson: string; phone: string; email: string; gstin: string;
  address: string; city: string; state: string; pincode: string; notes: string;
};
const EMPTY: Form = { name: '', contactPerson: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '', notes: '' };

const norm = (s = '') => s.trim().replace(/\s+/g, ' ').toLowerCase();

// Mirrors backend/src/modules/purchase/lib/vendor-input.ts — the server re-validates.
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = 'Vendor name is required';
  const phone = f.phone.trim().replace(/[\s-]/g, '');
  if (phone && !/^(?:\+?91|0)?[6-9]\d{9}$/.test(phone)) e.phone = 'Enter a valid 10-digit mobile number';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gstin.trim().toUpperCase())) e.gstin = 'Enter a valid 15-character GSTIN';
  if (f.pincode.trim() && !/^[1-9]\d{5}$/.test(f.pincode.trim())) e.pincode = 'Enter a valid 6-digit PIN code';
  return e;
}

const labelCls = 'text-[11px] font-medium text-[#66706A] mb-1 block font-jakarta';
const inputCls = 'h-9 text-sm font-jakarta rounded-[10px] border-[#ECE9E1] focus-visible:ring-[#1E5E3F]/20';

export function QuickAddVendorDialog({ open, materialName, onClose, onCreated }: {
  open: boolean;
  /** Line item the dialog was opened from (shown in the subtitle). */
  materialName?: string;
  onClose: () => void;
  /** Called with the saved (or chosen existing) vendor; the caller assigns it to its own line item. */
  onCreated: (vendor: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [duplicate, setDuplicate] = useState<{ message: string; vendor?: any } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setForm(EMPTY); setErrors({}); setDuplicate(null); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (data: Form) => api.createPurchaseVendor(data),
    onSuccess: (vendor) => {
      // Put it in the shared list right away so the controlled <select> can show it, then resync.
      queryClient.setQueryData<any[]>(['purchase-vendors'], (old = []) =>
        [...old.filter(v => v._id !== vendor._id), vendor].sort((a, b) => a.name.localeCompare(b.name)));
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors-all'] });
      toast({ title: 'Vendor added', description: `${vendor.name} saved and selected${materialName ? ` for ${materialName}` : ''}.` });
      onCreated(vendor);
      onClose();
    },
    onError: async (err: any, data) => {
      const message = getApiError(err);
      if (err?.response?.status === 409) {
        const list = await queryClient.fetchQuery({ queryKey: ['purchase-vendors'], queryFn: () => api.getPurchaseVendors(), staleTime: 0 }).catch(() => []);
        const gst = data.gstin.trim().toUpperCase();
        const vendor = (list as any[]).find(v => norm(v.name) === norm(data.name) || (gst && v.gstin === gst));
        setDuplicate({ message, vendor });
        return;
      }
      toast({ title: 'Could not save vendor', description: message, variant: 'destructive' });
    },
  });

  const saving = mutation.isPending;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm(p => ({ ...p, [k]: value }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: undefined }));
    if (duplicate && (k === 'name' || k === 'gstin')) setDuplicate(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // dialog is portalled, but keep the submit away from any parent PO form
    if (saving) return;
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      if (errs.name) nameRef.current?.focus();
      return;
    }
    setDuplicate(null);
    mutation.mutate(form);
  };

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, span2 = false) => (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <label htmlFor={`qav-${k}`} className={labelCls}>{label}</label>
      <Input id={`qav-${k}`} value={form[k]} onChange={set(k)} disabled={saving}
        aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `qav-${k}-err` : undefined}
        className={`${inputCls} ${errors[k] ? 'border-[#E5534B]' : ''}`} {...props} />
      {errors[k] && <p id={`qav-${k}-err`} className="mt-1 text-[11px] text-[#A3241A] font-jakarta">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent
        className="sm:max-w-xl rounded-[18px] border-[#ECE9E1] bg-white p-5 sm:p-6 gap-0 shadow-[0_12px_40px_rgba(24,33,28,.18)]"
        onOpenAutoFocus={e => { e.preventDefault(); nameRef.current?.focus(); }}
        onEscapeKeyDown={e => { if (saving) e.preventDefault(); }}
        onPointerDownOutside={e => { if (saving) e.preventDefault(); }}
      >
        <div className="pr-8 mb-4">
          <DialogTitle className="text-lg font-semibold text-[#18211C] font-jakarta">Add New Vendor</DialogTitle>
          <DialogDescription className="text-xs text-[#66706A] mt-1 font-jakarta">
            Add vendor details to continue creating your purchase order.
            {materialName && <> It will be selected for <span className="font-semibold text-[#18211C]">{materialName}</span>.</>}
          </DialogDescription>
        </div>

        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="qav-name" className={labelCls}>Vendor / Company Name <span className="text-[#A3241A]">*</span></label>
              <Input id="qav-name" ref={nameRef} value={form.name} onChange={set('name')} disabled={saving}
                placeholder="e.g. Shree Ganesh Traders" maxLength={200} autoComplete="organization"
                aria-required aria-invalid={!!errors.name} aria-describedby={errors.name ? 'qav-name-err' : undefined}
                className={`${inputCls} ${errors.name ? 'border-[#E5534B]' : ''}`} />
              {errors.name && <p id="qav-name-err" className="mt-1 text-[11px] text-[#A3241A] font-jakarta">{errors.name}</p>}
            </div>
            {field('contactPerson', 'Contact Person', { placeholder: 'Full name', autoComplete: 'name' })}
            {field('phone', 'Mobile Number', { type: 'tel', inputMode: 'tel', placeholder: '98765 43210', autoComplete: 'tel' })}
            {field('email', 'Email Address', { type: 'email', placeholder: 'vendor@example.com', autoComplete: 'email' })}
            {field('gstin', 'GSTIN', { placeholder: '22AAAAA0000A1Z5', maxLength: 15, className: `${inputCls} uppercase font-jetbrains ${errors.gstin ? 'border-[#E5534B]' : ''}` })}
            {field('address', 'Business Address', { placeholder: 'Building, street, area', autoComplete: 'street-address' }, true)}
            {field('city', 'City', { autoComplete: 'address-level2' })}
            {field('state', 'State', { autoComplete: 'address-level1' })}
            {field('pincode', 'PIN Code', { inputMode: 'numeric', maxLength: 6, placeholder: '452001', autoComplete: 'postal-code' })}
            <div className="sm:col-span-2">
              <label htmlFor="qav-notes" className={labelCls}>Vendor Notes <span className="text-[#8A9490]">(optional)</span></label>
              <textarea id="qav-notes" value={form.notes} onChange={set('notes')} disabled={saving} rows={2}
                placeholder="Payment terms, delivery days, anything useful…"
                className="w-full rounded-[10px] border border-[#ECE9E1] bg-white px-3 py-2 text-sm font-jakarta resize-none focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20 disabled:opacity-50" />
            </div>
          </div>

          {duplicate && (
            <div role="alert" className="rounded-[12px] border border-[#F3D9A4] bg-[#FDF6E7] px-3 py-2.5 text-xs text-[#7A5200] font-jakarta flex flex-wrap items-center gap-2 justify-between">
              <span>{duplicate.message}</span>
              {duplicate.vendor && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs rounded-[8px] border-[#C77700] text-[#7A5200]"
                  onClick={() => { onCreated(duplicate.vendor); onClose(); }}>
                  Use existing vendor
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}
              className="h-9 rounded-[10px] border-[#ECE9E1] font-jakarta">Cancel</Button>
            <Button type="submit" disabled={saving}
              className="h-9 rounded-[10px] bg-[#1E5E3F] hover:bg-[#1E5E3F]/90 text-white font-jakarta min-w-[120px]">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : 'Save Vendor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
