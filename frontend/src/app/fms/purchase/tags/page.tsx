'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Check, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/fms/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

const PRESET_COLORS = [
  '#1E5E3F','#2E7D32','#00695C','#1565C0','#6A1B9A',
  '#AD1457','#C62828','#E65100','#F57F17','#4E342E',
];

export default function FmsPurchaseTagsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = usePermission('tags.manage');

  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [desc, setDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['purchase-tags-all'],
    queryFn: () => api.getPurchaseTags(),
  });

  const seedMut = useMutation({
    mutationFn: () => api.seedPurchaseTags(),
    onSuccess: (r) => {
      toast({ title: `${r.created} default tags added` });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags'] });
    },
    onError: (err) => toast({ title: 'Seed failed', description: getApiError(err), variant: 'destructive' }),
  });

  const createMut = useMutation({
    mutationFn: () => api.createPurchaseTag({ name: name.trim(), color, description: desc.trim() }),
    onSuccess: () => {
      toast({ title: 'Tag created' });
      setName(''); setDesc(''); setColor(PRESET_COLORS[0]);
      queryClient.invalidateQueries({ queryKey: ['purchase-tags-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; data: any }) => api.updatePurchaseTag(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-tags-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-tags'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    updateMut.mutate({ id, data: { name: editName.trim() } });
    setEditingId(null);
  };

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#F7F6F2' }}>
        <p className="text-sm text-[#66706A] font-jakarta">Needs tags.manage permission.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-[#8A9490] mb-1 font-jakarta">
          <Tag className="h-3.5 w-3.5" />
          <span>Tags</span>
        </div>
        <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">Purchase Tags</h1>
        <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">Categorize materials by processing type or commodity group</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMut.mutate(); }}
          className="bg-white rounded-xl border border-gray-100 p-4 space-y-3"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-700">Tag Name</label>
              <Input
                className="mt-1 h-9 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Edible Oil"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-700">Description (optional)</label>
              <Input
                className="mt-1 h-9 text-sm"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Short note"
              />
            </div>
            <Button type="submit" size="sm" disabled={!name.trim() || createMut.isPending} className="bg-[#2F6B47] hover:bg-[#2F6B47]/90 shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? '#18211C' : 'transparent' }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-7 w-7 rounded-full cursor-pointer border border-gray-200"
                title="Custom color"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 px-3 rounded-full flex items-center text-xs font-medium text-white font-jakarta" style={{ background: color }}>
              {name || 'Preview'}
            </div>
            <span className="text-xs text-gray-400 font-jakarta">Tag preview</span>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-medium text-gray-800">Tags ({(tags as any[]).length})</p>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-2 border-[#2F6B47] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (tags as any[]).length === 0 ? (
            <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-gray-500">No tags yet.</p>
              <Button size="sm" variant="outline" disabled={seedMut.isPending} onClick={() => seedMut.mutate()} className="text-[#2F6B47] border-[#2F6B47]">
                <Sparkles className="h-4 w-4 mr-1" />
                {seedMut.isPending ? 'Loading…' : 'Load default tags'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Tag</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Description</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Active</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(tags as any[]).map((tag: any) => (
                    <tr key={tag._id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        {editingId === tag._id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 text-xs w-32"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag._id); if (e.key === 'Escape') setEditingId(null); }}
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(tag._id)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80 font-jakarta"
                            style={{ background: tag.color }}
                            onClick={() => { setEditingId(tag._id); setEditName(tag.name); }}
                          >
                            {tag.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{tag.description || '—'}</td>
                      <td className="px-4 py-2">
                        <Switch
                          checked={tag.isActive}
                          onCheckedChange={checked => updateMut.mutate({ id: tag._id, data: { isActive: checked } })}
                        />
                      </td>
                      <td className="px-4 py-2" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
