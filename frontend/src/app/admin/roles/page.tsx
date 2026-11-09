'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Plus, Copy, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import type { AccessRole, AdminPageDef } from '@/types';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function AccessRolesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registry = [] } = useQuery({ queryKey: ['access-registry'], queryFn: () => api.getAccessRegistry() });
  const { data: roles = [] } = useQuery({ queryKey: ['access-roles'], queryFn: () => api.getAccessRoles() });

  // selectedId: existing role id, 'new' for an unsaved role, null for nothing selected
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());

  const selected = roles.find((r) => r._id === selectedId);

  useEffect(() => {
    if (selectedId === null && roles.length > 0) setSelectedId(roles[0]._id);
  }, [roles, selectedId]);

  // Keyed on content, not object identity, so a background refetch doesn't wipe unsaved edits.
  const sig = selected ? JSON.stringify([selected._id, selected.name, selected.description, selected.permissions]) : '';
  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setDescription(selected.description ?? '');
      setPerms(new Set(selected.permissions));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const groups = useMemo(() => {
    const out: { label: string; pages: AdminPageDef[] }[] = [];
    registry.forEach((p) => {
      let g = out.find((x) => x.label === p.group);
      if (!g) out.push((g = { label: p.group, pages: [] }));
      g.pages.push(p);
    });
    return out;
  }, [registry]);

  const toggle = (page: AdminPageDef, permission: string, on: boolean) => {
    const next = new Set(perms);
    const view = page.actions[0].permission; // every page lists View first
    if (on) {
      next.add(permission);
      next.add(view); // any action needs the page to be visible
    } else {
      next.delete(permission);
      if (permission === view) page.actions.forEach((a) => next.delete(a.permission));
    }
    setPerms(next);
  };

  const setAllForPages = (pages: AdminPageDef[], on: boolean) => {
    const next = new Set(perms);
    pages.forEach((p) => p.actions.forEach((a) => (on ? next.add(a.permission) : next.delete(a.permission))));
    setPerms(next);
  };

  const startNew = (from?: AccessRole) => {
    setSelectedId('new');
    setName(from ? `${from.name} (copy)` : '');
    setDescription(from?.description ?? '');
    setPerms(new Set(from?.permissions ?? []));
  };

  const onError = (err: unknown) =>
    toast({ title: 'Failed', description: getApiError(err, 'Please try again.'), variant: 'destructive' });

  const save = useMutation({
    mutationFn: async () => {
      // Only send keys the registry still knows; the server rejects stale ones.
      const known = new Set(registry.flatMap((p) => p.actions.map((a) => a.permission)));
      const body = { name, description, permissions: Array.from(perms).filter((p) => known.has(p)) };
      return selectedId === 'new' ? api.createAccessRole(body) : api.updateAccessRole(selectedId!, body);
    },
    onSuccess: (role) => {
      toast({ title: 'Role saved', description: 'Changes apply on each user’s next action.' });
      queryClient.invalidateQueries({ queryKey: ['access-roles'] });
      queryClient.invalidateQueries({ queryKey: ['my-access'] });
      setSelectedId(role._id);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteAccessRole(selectedId!),
    onSuccess: () => {
      toast({ title: 'Role deleted' });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['access-roles'] });
    },
    onError,
  });

  const total = registry.reduce((n, p) => n + p.actions.length, 0);

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Roles & Access"
        description="Create roles and choose exactly which pages and actions each can use."
        icon={<ShieldCheck className="h-6 w-6 text-amber-600" />}
        action={
          <Button size="sm" onClick={() => startNew()}>
            <Plus className="h-4 w-4 mr-1" /> New role
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden grid md:grid-cols-[260px,1fr]">
        <aside className="border-r bg-white overflow-auto p-3 space-y-1">
          {roles.length === 0 && selectedId !== 'new' && (
            <p className="text-sm text-gray-500 p-2">No roles yet. Create your first one.</p>
          )}
          {roles.map((r) => (
            <button
              key={r._id}
              onClick={() => setSelectedId(r._id)}
              className={cn(
                'w-full text-left rounded-lg px-3 py-2 text-sm',
                selectedId === r._id ? 'bg-amber-50 text-amber-900' : 'hover:bg-gray-50 text-gray-700',
              )}
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray-500">
                {r.permissions.length} permissions · {r.userCount ?? 0} user{r.userCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
          {selectedId === 'new' && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">New role (unsaved)</div>}
        </aside>

        <section className="overflow-auto p-6">
          {selectedId === null ? (
            <p className="text-sm text-gray-500">Select or create a role.</p>
          ) : (
            <div className="space-y-5 max-w-4xl">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Role name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Order Manager" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Description (optional)</label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">{perms.size} of {total} permissions selected</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAllForPages(registry, true)}>Select all</Button>
                  <Button variant="outline" size="sm" onClick={() => setAllForPages(registry, false)}>Clear all</Button>
                </div>
              </div>

              {groups.map((g) => (
                <div key={g.label} className="rounded-xl border bg-white overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 border-b px-4 py-2">
                    <p className="text-xs font-mono uppercase tracking-wider text-gray-500">{g.label}</p>
                    <div className="flex gap-3 text-xs">
                      <button className="text-amber-700 hover:underline" onClick={() => setAllForPages(g.pages, true)}>all</button>
                      <button className="text-gray-500 hover:underline" onClick={() => setAllForPages(g.pages, false)}>none</button>
                    </div>
                  </div>
                  {g.pages.map((p) => (
                    <div key={p.page} className="border-b last:border-0 px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-900">{p.label}</span>
                        {!p.enforced && (
                          <span
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                            title="Hidden from the menu and blocked in the UI, but its API is not permission-checked yet"
                          >
                            page access only
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {p.actions.map((a) => (
                          <label key={a.key} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-amber-600"
                              checked={perms.has(a.permission)}
                              onChange={(e) => toggle(p, a.permission, e.target.checked)}
                            />
                            {a.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="flex items-center gap-2 pb-8">
                <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save role'}
                </Button>
                {selected && (
                  <>
                    <Button variant="outline" onClick={() => startNew(selected)}>
                      <Copy className="h-4 w-4 mr-1" /> Clone
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`Delete role "${selected.name}"?`)) remove.mutate();
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
