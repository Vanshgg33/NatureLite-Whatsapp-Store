'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Check, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

const CATEGORIES = ['General', 'Oilseed', 'Grain', 'Pulse', 'Spice', 'Packaging'];

export default function PurchaseMaterialsPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [editingName, setEditingName] = useState<Record<string, string>>({});

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['purchase-materials-all'],
    queryFn: () => api.getPurchaseMaterials(true),
  });

  const seedMutation = useMutation({
    mutationFn: () => api.seedPurchaseMaterials(),
    onSuccess: (res) => {
      toast({ title: `${res.created} default materials added` });
      queryClient.invalidateQueries({ queryKey: ['purchase-materials-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
    },
    onError: (err) => toast({ title: 'Seed failed', description: getApiError(err), variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createPurchaseMaterial({ name: name.trim(), category }),
    onSuccess: () => {
      toast({ title: 'Material added' });
      setName('');
      setCategory('General');
      queryClient.invalidateQueries({ queryKey: ['purchase-materials-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) =>
      api.updatePurchaseMaterial(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-materials-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const startEdit = (mat: any) =>
    setEditingName((prev) => ({ ...prev, [mat._id]: mat.name }));

  const cancelEdit = (id: string) =>
    setEditingName((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const saveEdit = (id: string) => {
    const newName = editingName[id]?.trim();
    if (!newName) return;
    updateMutation.mutate({ id, data: { name: newName } });
    cancelEdit(id);
  };

  if (!isSuperadmin) {
    return (
      <div className="flex flex-col h-screen">
        <Header title="Purchase Materials" icon={<Package className="h-6 w-6 text-amber-600" />} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Superadmin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Purchase Materials"
        description="Master list of raw materials for procurement"
        icon={<Package className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Add form */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
          className="bg-white rounded-xl border border-gray-100 p-4 flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-700">Material Name</label>
            <Input
              className="mt-1 h-9 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groundnut (Bold)"
            />
          </div>
          <div className="w-36">
            <label className="text-xs font-medium text-gray-700">Category</label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={!name.trim() || createMutation.isPending} className="bg-[#2F6B47] hover:bg-[#2F6B47]/90">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </form>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-medium text-gray-800">Materials ({materials.length})</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : materials.length === 0 ? (
            <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-gray-500">No materials yet.</p>
              <Button
                size="sm" variant="outline"
                disabled={seedMutation.isPending}
                onClick={() => seedMutation.mutate()}
                className="text-[#2F6B47] border-[#2F6B47]"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {seedMutation.isPending ? 'Loading…' : 'Load default NatureLite materials'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Category</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Unit</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Active</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {materials.map((mat: any) => {
                    const isEditing = mat._id in editingName;
                    return (
                      <tr key={mat._id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 text-xs w-44"
                                value={editingName[mat._id]}
                                onChange={(e) => setEditingName((p) => ({ ...p, [mat._id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(mat._id);
                                  if (e.key === 'Escape') cancelEdit(mat._id);
                                }}
                                autoFocus
                              />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(mat._id)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500" onClick={() => cancelEdit(mat._id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span
                              className="cursor-pointer hover:text-[#2F6B47] hover:underline"
                              onClick={() => startEdit(mat)}
                            >
                              {mat.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{mat.category}</td>
                        <td className="px-4 py-2 font-mono text-gray-500">{mat.unit}</td>
                        <td className="px-4 py-2">
                          <Switch
                            checked={mat.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({ id: mat._id, data: { isActive: checked } })
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
          Deactivated materials won&apos;t appear in the request dropdown but remain in existing records.
        </p>
      </div>
    </div>
  );
}
