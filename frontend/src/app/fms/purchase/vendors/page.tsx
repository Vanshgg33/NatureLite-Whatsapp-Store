'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

type VendorForm = { name: string; phone: string; email: string; address: string; gstin: string; paymentTerms: string };
const EMPTY_FORM: VendorForm = { name: '', phone: '', email: '', address: '', gstin: '', paymentTerms: '' };

export default function FmsPurchaseVendorsPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperadmin = user?.role === 'superadmin';

  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Record<string, VendorForm>>({});

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['purchase-vendors-all'],
    queryFn: () => api.getPurchaseVendors(true),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createPurchaseVendor(form),
    onSuccess: () => {
      toast({ title: 'Vendor added' });
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) => api.updatePurchaseVendor(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-vendors'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const startEdit = (v: any) =>
    setEditing((prev) => ({
      ...prev,
      [v._id]: { name: v.name, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin, paymentTerms: v.paymentTerms },
    }));

  const cancelEdit = (id: string) =>
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const saveEdit = (id: string) => {
    const data = editing[id];
    if (!data?.name?.trim()) return;
    updateMutation.mutate({ id, data });
    cancelEdit(id);
  };

  const setField = (k: keyof VendorForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  if (!isSuperadmin) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="Vendors" icon={<Building2 className="h-6 w-6 text-amber-600" />} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Superadmin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Vendors"
        description="Saved vendor profiles for Purchase Orders"
        icon={<Building2 className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Add form */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) createMutation.mutate(); }}
          className="bg-white rounded-xl border border-gray-100 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-800">Add New Vendor</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Name *</label>
              <Input className="mt-1 h-9 text-sm" value={form.name} onChange={setField('name')} placeholder="e.g. Sunrise Traders" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Phone</label>
              <Input className="mt-1 h-9 text-sm" value={form.phone} onChange={setField('phone')} placeholder="9XXXXXXXXX" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Email</label>
              <Input className="mt-1 h-9 text-sm" value={form.email} onChange={setField('email')} placeholder="vendor@email.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">GSTIN</label>
              <Input className="mt-1 h-9 text-sm" value={form.gstin} onChange={setField('gstin')} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Payment Terms</label>
              <Input className="mt-1 h-9 text-sm" value={form.paymentTerms} onChange={setField('paymentTerms')} placeholder="e.g. 30 days credit" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Address</label>
              <Input className="mt-1 h-9 text-sm" value={form.address} onChange={setField('address')} placeholder="Full address" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!form.name.trim() || createMutation.isPending} className="bg-[#2F6B47] hover:bg-[#2F6B47]/90">
              <Plus className="h-4 w-4 mr-1" /> Add Vendor
            </Button>
          </div>
        </form>

        {/* Vendor table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-medium text-gray-800">Vendors ({vendors.length})</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vendors.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No vendors yet. Add one above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Phone</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">GSTIN</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Terms</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Active</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v: any) => {
                    const isEditing = v._id in editing;
                    const ef = editing[v._id] ?? {} as VendorForm;
                    return (
                      <tr key={v._id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 text-xs w-40"
                                value={ef.name}
                                onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], name: e.target.value } }))}
                                autoFocus
                              />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(v._id)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500" onClick={() => cancelEdit(v._id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <span
                                className="cursor-pointer font-medium hover:text-[#2F6B47] hover:underline"
                                onClick={() => startEdit(v)}
                              >
                                {v.name}
                              </span>
                              {v.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{v.address}</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-28"
                              value={ef.phone}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], phone: e.target.value } }))}
                            />
                          ) : (v.phone || '—')}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-36"
                              value={ef.gstin}
                              maxLength={15}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], gstin: e.target.value } }))}
                            />
                          ) : (v.gstin || '—')}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {isEditing ? (
                            <Input
                              className="h-7 text-xs w-28"
                              value={ef.paymentTerms}
                              onChange={(e) => setEditing((p) => ({ ...p, [v._id]: { ...p[v._id], paymentTerms: e.target.value } }))}
                            />
                          ) : (v.paymentTerms || '—')}
                        </td>
                        <td className="px-4 py-2">
                          <Switch
                            checked={v.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({ id: v._id, data: { isActive: checked } })
                            }
                          />
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Deactivated vendors won&apos;t appear in the PO vendor selector but remain in existing records.
        </p>
      </div>
    </div>
  );
}
