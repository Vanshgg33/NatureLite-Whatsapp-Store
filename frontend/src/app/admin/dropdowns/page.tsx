'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import type { DropdownSettings } from '@/types';

const EMPTY: DropdownSettings = { cities: [], states: [], deliveryTypes: [], paymentTypes: [] };

type DropdownKey = keyof DropdownSettings;

const SECTIONS: { key: DropdownKey; label: string; description: string }[] = [
  { key: 'cities', label: 'Cities', description: 'Available city options for delivery address' },
  { key: 'states', label: 'States', description: 'Available state options for delivery address' },
  { key: 'deliveryTypes', label: 'Delivery Types', description: 'Options shown in sale type dropdown' },
  { key: 'paymentTypes', label: 'Payment Types', description: 'Custom payment method options' },
];

function DropdownSection({
  label,
  description,
  items,
  onAdd,
  onRemove,
  onMove,
}: {
  label: string;
  description: string;
  items: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const v = newItem.trim();
    if (!v || items.includes(v)) return;
    onAdd(v);
    setNewItem('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No items yet. Add one below.</p>
          )}
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 group">
              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => onMove(idx, idx - 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none p-0.5"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => onMove(idx, idx + 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none p-0.5"
                >
                  ▼
                </button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              <span className="flex-1 text-sm py-1.5 px-2 rounded-md bg-muted/40">{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => onRemove(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder={`Add ${label.toLowerCase().replace(/s$/, '')}…`}
            className="h-8 text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={!newItem.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DropdownsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: saved, isLoading } = useQuery({
    queryKey: ['dropdown-settings'],
    queryFn: () => api.getDropdownSettings(),
  });

  const [local, setLocal] = useState<DropdownSettings | null>(null);
  const settings = local ?? saved ?? EMPTY;

  const saveMutation = useMutation({
    mutationFn: (data: DropdownSettings) => api.saveDropdownSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dropdown-settings'] });
      setLocal(null);
      toast({ title: 'Saved', description: 'Dropdown options updated.' });
    },
    onError: () => {
      toast({ title: 'Failed to save', variant: 'destructive' });
    },
  });

  const update = (key: DropdownKey, items: string[]) => {
    setLocal({ ...settings, [key]: items });
  };

  const handleAdd = (key: DropdownKey, val: string) =>
    update(key, [...settings[key], val]);

  const handleRemove = (key: DropdownKey, idx: number) =>
    update(key, settings[key].filter((_, i) => i !== idx));

  const handleMove = (key: DropdownKey, from: number, to: number) => {
    const arr = [...settings[key]];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    update(key, arr);
  };

  const isDirty = local !== null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dropdown Options</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure the options shown in dropdown fields across the sales form.</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate(settings)}
          disabled={!isDirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {SECTIONS.map(({ key, label, description }) => (
          <DropdownSection
            key={key}
            label={label}
            description={description}
            items={settings[key]}
            onAdd={(val) => handleAdd(key, val)}
            onRemove={(idx) => handleRemove(key, idx)}
            onMove={(from, to) => handleMove(key, from, to)}
          />
        ))}
      </div>
    </div>
  );
}
