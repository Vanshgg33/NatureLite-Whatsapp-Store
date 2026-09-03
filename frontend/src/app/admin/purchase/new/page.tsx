'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ShoppingBag, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

export default function NewPurchaseRequestPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const canCreate = user?.purchaseRole === 'requester' || isSuperadmin;

  const [items, setItems] = useState([{ materialId: '', materialName: '', qtyKg: '' }]);
  const [note, setNote] = useState('');

  const { data: materials = [] } = useQuery({
    queryKey: ['purchase-materials'],
    queryFn: () => api.getPurchaseMaterials(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createPurchaseRequest(data),
    onSuccess: (req) => {
      toast({ title: 'Request created', description: `${req.reqNo} sent to Purchase Desk.` });
      router.push('/admin/purchase');
    },
    onError: (err) => {
      toast({ title: 'Error', description: getApiError(err), variant: 'destructive' });
    },
  });

  const addRow = () => setItems((prev) => [...prev, { materialId: '', materialName: '', qtyKg: '' }]);

  const removeRow = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateRow = (i: number, field: string, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      if (field === 'materialId') {
        const mat = materials.find((m: any) => m._id === value);
        next[i] = { ...next[i], materialId: value, materialName: mat?.name || '' };
      } else {
        next[i] = { ...next[i], [field]: value };
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const item of items) {
      if (!item.materialId) {
        toast({ title: 'Select material for all rows', variant: 'destructive' });
        return;
      }
      const qty = parseFloat(item.qtyKg);
      if (!qty || qty <= 0) {
        toast({ title: 'Enter valid quantity (> 0) for all rows', variant: 'destructive' });
        return;
      }
    }
    createMutation.mutate({
      items: items.map((i) => ({ materialId: i.materialId, materialName: i.materialName, qtyKg: parseFloat(i.qtyKg) })),
      note: note || undefined,
    });
  };

  if (!canCreate) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="New Purchase Request" icon={<ShoppingBag className="h-6 w-6 text-amber-600" />} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Only requesters can create purchase requests.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="New Purchase Request"
        description="Select materials and quantities"
        icon={<ShoppingBag className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Materials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select value={item.materialId} onValueChange={(v) => updateRow(i, 'materialId', v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((m: any) => (
                          <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36 flex items-center">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      step="0.1"
                      value={item.qtyKg}
                      onChange={(e) => updateRow(i, 'qtyKg', e.target.value)}
                      placeholder="Qty"
                      className="h-9 text-sm rounded-r-none"
                    />
                    <span className="h-9 flex items-center px-2 border border-l-0 rounded-r-md bg-gray-50 text-xs text-gray-500 font-mono">
                      KG
                    </span>
                  </div>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-500 flex-shrink-0"
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add material
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <label className="text-xs font-medium text-gray-700">Note (optional)</label>
              <Input
                className="mt-1 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. urgent — press idle from Thursday"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#2F6B47] hover:bg-[#2F6B47]/90"
            >
              {createMutation.isPending ? 'Sending…' : 'Send Request'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
