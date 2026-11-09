'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AccessRole, AdminPageDef, AdminUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type State = 'inherit' | 'allow' | 'deny';
const NEXT: Record<State, State> = { inherit: 'allow', allow: 'deny', deny: 'inherit' };

interface Props {
  user: AdminUser | null;
  roles: AccessRole[];
  registry: AdminPageDef[];
  saving: boolean;
  onClose: () => void;
  onSave: (data: { permissions: string[]; deniedPermissions: string[] }) => void;
}

/** Per-user overrides on top of the access role: click a permission to cycle role default → extra allow → deny. */
export function UserAccessDialog({ user, roles, registry, saving, onClose, onSave }: Props) {
  const known = useMemo(() => new Set(registry.flatMap((p) => p.actions.map((a) => a.permission))), [registry]);
  const role = roles.find((r) => r._id === user?.accessRole);
  const rolePerms = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const [states, setStates] = useState<Record<string, State>>({});

  useEffect(() => {
    if (!user) return;
    const next: Record<string, State> = {};
    (user.permissions ?? []).forEach((p) => known.has(p) && (next[p] = 'allow'));
    (user.deniedPermissions ?? []).forEach((p) => known.has(p) && (next[p] = 'deny'));
    setStates(next);
  }, [user, known]);

  const save = () => {
    if (!user) return;
    // Keep any stored keys this screen doesn't manage; replace the ones it does.
    // Stale `admin.*` keys (page removed from the registry) are dropped; the server rejects unknown ones.
    const keep = (list: string[] = []) => list.filter((p) => !known.has(p) && !p.startsWith('admin.'));
    const pick = (s: State) => Object.entries(states).filter(([, v]) => v === s).map(([k]) => k);
    onSave({
      permissions: [...keep(user.permissions), ...pick('allow')],
      deniedPermissions: [...keep(user.deniedPermissions), ...pick('deny')],
    });
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Custom access for {user?.name}</DialogTitle>
          <DialogDescription>
            {role ? <>Starts from role <strong>{role.name}</strong>. </> : <>No access role assigned: pages are unrestricted. </>}
            Click a permission to cycle: <strong>role default</strong> → <span className="text-green-700">+ extra allow</span> →{' '}
            <span className="text-red-700">− deny</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {registry.map((p) => (
            <div key={p.page} className="rounded-lg border px-3 py-2">
              <p className="text-sm font-medium text-gray-900 mb-1.5">{p.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {p.actions.map((a) => {
                  const s = states[a.permission] ?? 'inherit';
                  const on = s === 'allow' || (s === 'inherit' && rolePerms.has(a.permission));
                  return (
                    <button
                      key={a.permission}
                      type="button"
                      onClick={() => setStates((prev) => ({ ...prev, [a.permission]: NEXT[s] }))}
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs',
                        s === 'deny' && 'border-red-300 bg-red-50 text-red-700 line-through',
                        s === 'allow' && 'border-green-400 bg-green-50 text-green-800',
                        s === 'inherit' && (on ? 'border-gray-300 bg-gray-100 text-gray-800' : 'border-dashed text-gray-400'),
                      )}
                    >
                      {s === 'allow' && '+ '}
                      {s === 'deny' && '− '}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save access'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
