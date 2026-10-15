'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, KeyRound, Camera, ToggleLeft, ToggleRight, X, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { usePermission, PURCHASE_PERMISSIONS, ROLE_PRESETS, type PurchasePermission } from '@/lib/fms/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

const PRESET_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  REQUESTER: 'Requester',
  APPROVER: 'Approver',
  RECEIVER: 'Receiver',
  PURCHASE_OFFICER: 'Purchase Officer',
  CUSTOM: 'Custom',
};

const PERM_LABELS: Record<PurchasePermission, string> = {
  'pr.create': 'Create PR',
  'po.raise': 'Raise PO',
  'po.approve': 'Approve PO',
  'delivery.receive': 'Receive Goods',
  'request.close': 'Close Request',
  'request.cancel': 'Cancel Request',
  'deadline.set': 'Set Deadline',
  'materials.manage': 'Manage Materials',
  'tags.manage': 'Manage Tags',
  'vendors.manage': 'Manage Vendors',
  'users.manage': 'Manage Users',
};

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#$';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function UserCard({ u, onEdit }: { u: any; onEdit: () => void }) {
  const initial = u.name?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="bg-white rounded-[16px] border border-[#ECE9E1] p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
      <div className="flex items-start gap-3">
        {u.avatar ? (
          <img src={u.avatar} alt={u.name} className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ background: '#1E5E3F' }}>
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#18211C] font-jakarta text-sm">{u.name}</p>
            {u.rolePreset && u.rolePreset !== 'CUSTOM' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-jakarta font-medium" style={{ background: '#EAF3EE', color: '#1E5E3F' }}>
                {PRESET_LABELS[u.rolePreset] ?? u.rolePreset}
              </span>
            )}
            {!u.isActive && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-jakarta" style={{ background: '#FDECEA', color: '#A3241A' }}>Inactive</span>
            )}
          </div>
          <p className="text-xs text-[#66706A] font-jakarta">{u.designation ?? '—'}</p>
          <p className="text-[10px] text-[#8A9490] font-jetbrains mt-0.5">{u.loginId ?? u.email}</p>
        </div>
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[#F7F6F2] text-[#66706A] hover:text-[#18211C]">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {u.permissions?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {(u.permissions as string[]).map((p) => (
            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded font-jetbrains" style={{ background: '#F7F6F2', color: '#3E4A43' }}>{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

type DrawerUser = {
  _id?: string;
  name: string;
  loginId: string;
  designation: string;
  tempPassword: string;
  rolePreset: string;
  permissions: PurchasePermission[];
  isActive: boolean;
};

const BLANK: DrawerUser = { name: '', loginId: '', designation: '', tempPassword: '', rolePreset: 'CUSTOM', permissions: [], isActive: true };

export default function FmsUsersPage() {
  const canManage = usePermission('users.manage');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<DrawerUser>(BLANK);
  const [resetting, setResetting] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const cropToSquare = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const size = Math.min(img.width, img.height);
        const offX = (img.width  - size) / 2;
        const offY = (img.height - size) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        canvas.getContext('2d')!.drawImage(img, offX, offY, size, size, 0, 0, 256, 256);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = url;
    });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['fms-users'],
    queryFn: () => api.getFmsUsers(),
    enabled: canManage,
  });

  const saveMut = useMutation({
    mutationFn: (f: DrawerUser) =>
      f._id
        ? api.updateFmsUser(f._id, { name: f.name, designation: f.designation, rolePreset: f.rolePreset, permissions: f.permissions, isActive: f.isActive })
        : api.createFmsUser({ name: f.name, loginId: f.loginId, designation: f.designation, rolePreset: f.rolePreset, permissions: f.permissions, tempPassword: f.tempPassword }),
    onSuccess: () => {
      toast({ title: form._id ? 'User updated' : 'User created' });
      queryClient.invalidateQueries({ queryKey: ['fms-users'] });
      setDrawerOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const resetMut = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) => api.resetFmsUserPassword(id, pw),
    onSuccess: () => { toast({ title: 'Password reset' }); setResetting(false); setNewPw(''); },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const photoMut = useMutation({
    mutationFn: ({ id, photoUrl }: { id: string; photoUrl: string }) => api.setFmsUserPhoto(id, photoUrl),
    onSuccess: () => {
      toast({ title: 'Photo updated' });
      queryClient.invalidateQueries({ queryKey: ['fms-users'] });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form._id) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await cropToSquare(file);
      setPhotoPreview(dataUrl);
      photoMut.mutate({ id: form._id, photoUrl: dataUrl });
    } catch {
      toast({ title: 'Failed to process image', variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const openCreate = () => { setForm(BLANK); setResetting(false); setPhotoPreview(''); setDrawerOpen(true); };
  const openEdit   = (u: any) => {
    setForm({ _id: u._id, name: u.name, loginId: u.loginId ?? '', designation: u.designation ?? '', tempPassword: '', rolePreset: u.rolePreset ?? 'CUSTOM', permissions: u.permissions ?? [], isActive: u.isActive ?? true });
    setResetting(false);
    setPhotoPreview('');
    setDrawerOpen(true);
  };

  const setPreset = (preset: string) => {
    const perms = (ROLE_PRESETS[preset] ?? []) as PurchasePermission[];
    setForm((f) => ({ ...f, rolePreset: preset, permissions: perms }));
  };

  const togglePerm = (p: PurchasePermission) => {
    setForm((f) => ({
      ...f,
      rolePreset: 'CUSTOM',
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#66706A] font-jakarta gap-2">
        <span className="text-2xl">🔒</span>
        <p>You need <code className="font-jetbrains text-sm">users.manage</code> permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-fraunces text-2xl text-[#18211C]">FMS Users</h1>
        <Button onClick={openCreate} size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white" style={{ background: '#1E5E3F' }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-6 w-6 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => (
            <UserCard key={u._id} u={u} onEdit={() => openEdit(u)} />
          ))}
          {users.length === 0 && (
            <p className="col-span-3 text-center text-sm text-[#8A9490] font-jakarta py-10">No users yet. Add one.</p>
          )}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-[420px] bg-white flex flex-col shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECE9E1]">
              <h2 className="font-semibold text-[#18211C] font-jakarta">{form._id ? 'Edit User' : 'New User'}</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1 text-[#8A9490] hover:text-[#18211C]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1 block">Name *</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="h-9 text-sm font-jakarta" />
              </div>
              {!form._id && (
                <div>
                  <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1 block">Login ID *</label>
                  <Input value={form.loginId} onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value.toLowerCase().trim() }))} placeholder="e.g. ravi.kumar" className="h-9 text-sm font-jetbrains" />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1 block">Designation</label>
                <Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Purchase Manager" className="h-9 text-sm font-jakarta" />
              </div>

              {form._id && (
                <div className="flex items-center gap-3 py-1">
                  {(photoPreview || (users as any[]).find((u: any) => u._id === form._id)?.avatar) ? (
                    <img
                      src={photoPreview || (users as any[]).find((u: any) => u._id === form._id)?.avatar}
                      alt="photo"
                      className="h-14 w-14 rounded-full object-cover ring-2 ring-[#1E5E3F]/20 shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full flex items-center justify-center text-white font-semibold shrink-0 text-lg" style={{ background: '#1E5E3F' }}>
                      {form.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-[#18211C] font-jakarta mb-1">Profile photo</p>
                    <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
                    <button
                      type="button"
                      onClick={() => photoRef.current?.click()}
                      disabled={uploadingPhoto || photoMut.isPending}
                      className="text-xs text-[#1E5E3F] font-medium hover:underline font-jakarta disabled:opacity-40 flex items-center gap-1"
                    >
                      <Camera className="h-3 w-3" />
                      {uploadingPhoto ? 'Processing…' : 'Upload photo'}
                    </button>
                    <p className="text-[10px] text-[#8A9490] font-jakarta mt-0.5">Cropped to 256×256 px</p>
                  </div>
                </div>
              )}

              {!form._id && (
                <div>
                  <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1 block">Temp Password *</label>
                  <div className="flex gap-2">
                    <Input value={form.tempPassword} onChange={(e) => setForm((f) => ({ ...f, tempPassword: e.target.value }))} placeholder="Temporary password" className="h-9 text-sm font-jetbrains flex-1" />
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3 text-xs font-jakarta"
                      onClick={() => setForm((f) => ({ ...f, tempPassword: genPassword() }))}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Gen
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1.5 block">Role Preset</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(ROLE_PRESETS).map((preset) => (
                    <button key={preset} type="button"
                      onClick={() => setPreset(preset)}
                      className={`text-xs px-2.5 py-1 rounded-full font-jakarta border transition-colors ${form.rolePreset === preset ? 'border-[#1E5E3F] bg-[#EAF3EE] text-[#1E5E3F]' : 'border-[#ECE9E1] text-[#66706A] hover:border-[#1E5E3F]'}`}>
                      {PRESET_LABELS[preset]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#66706A] font-jakarta mb-1.5 block">Permissions</label>
                <div className="space-y-1">
                  {PURCHASE_PERMISSIONS.map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer py-0.5">
                      <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => togglePerm(p)} className="accent-[#1E5E3F]" />
                      <span className="text-xs font-jakarta text-[#18211C]">{PERM_LABELS[p]}</span>
                      <span className="text-[10px] font-jetbrains text-[#8A9490] ml-auto">{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form._id && (
                <div className="flex items-center justify-between py-2 border-t border-[#ECE9E1]">
                  <span className="text-xs font-semibold text-[#66706A] font-jakarta">Active</span>
                  <button onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} className="text-[#1E5E3F]">
                    {form.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6 text-[#8A9490]" />}
                  </button>
                </div>
              )}

              {form._id && (
                <div className="border-t border-[#ECE9E1] pt-4">
                  {resetting ? (
                    <div className="flex gap-2">
                      <Input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className="h-9 text-sm font-jetbrains flex-1" />
                      <Button type="button" size="sm" variant="outline" className="h-9 px-3 text-xs"
                        onClick={() => { setForm((f) => ({ ...f })); setNewPw(genPassword()); }}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="sm" className="h-9 px-3 text-xs text-white" style={{ background: '#1E5E3F' }}
                        disabled={!newPw.trim() || resetMut.isPending}
                        onClick={() => resetMut.mutate({ id: form._id!, pw: newPw.trim() })}>
                        Set
                      </Button>
                    </div>
                  ) : (
                    <button onClick={() => setResetting(true)} className="flex items-center gap-1.5 text-xs text-[#66706A] hover:text-[#18211C] font-jakarta">
                      <KeyRound className="h-3.5 w-3.5" /> Reset password
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[#ECE9E1] p-4 flex gap-2">
              <Button variant="outline" className="flex-1 h-9 text-xs font-jakarta" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button className="flex-1 h-9 text-xs font-jakarta text-white" style={{ background: '#1E5E3F' }}
                disabled={saveMut.isPending || !form.name.trim() || (!form._id && (!form.loginId.trim() || !form.tempPassword.trim()))}
                onClick={() => saveMut.mutate(form)}>
                {saveMut.isPending ? 'Saving…' : form._id ? 'Save Changes' : 'Create User'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
