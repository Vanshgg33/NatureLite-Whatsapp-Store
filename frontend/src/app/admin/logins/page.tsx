'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Eye, EyeOff, Check, X, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import type { AdminUser } from '@/types';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function AdminLoginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AdminUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.getAdminUsers(),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [departmentType, setDepartmentType] = useState<'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior' | 'none'>('none');

  // per-row password editing state
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingPassword, setEditingPassword] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState<Record<string, boolean>>({});

  // per-row phone editing state
  const [editingPhone, setEditingPhone] = useState<Record<string, string>>({});
  const [savingPhone, setSavingPhone] = useState<Record<string, boolean>>({});

  const toggleVisible = (id: string) =>
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));

  const startEdit = (user: AdminUser) =>
    setEditingPassword((prev) => ({ ...prev, [user._id]: user.plainPassword ?? '' }));

  const cancelEdit = (id: string) =>
    setEditingPassword((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const savePassword = async (id: string) => {
    const newPass = editingPassword[id];
    if (!newPass) return;
    if (newPass.length < 6) {
      toast({ title: 'Password too short', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setSavingPassword((prev) => ({ ...prev, [id]: true }));
    try {
      await resetPassword.mutateAsync({ id, password: newPass });
      cancelEdit(id);
    } catch {
      toast({ title: 'Failed to update password', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingPassword((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const startEditPhone = (user: AdminUser) =>
    setEditingPhone((prev) => ({ ...prev, [user._id]: user.phone ?? '' }));

  const cancelEditPhone = (id: string) =>
    setEditingPhone((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const savePhone = async (id: string) => {
    const newPhone = editingPhone[id].trim();
    setSavingPhone((prev) => ({ ...prev, [id]: true }));
    try {
      await updateUser.mutateAsync({ id, data: { phone: newPhone || undefined } });
      cancelEditPhone(id);
      toast({ title: 'Phone updated', description: 'Phone number has been saved.' });
    } catch {
      toast({ title: 'Failed to update phone', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingPhone((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const createUser = useMutation({
    mutationFn: () =>
      api.createAdminUser({
        name,
        email,
        password,
        phone: phone || undefined,
        role,
        departmentType: departmentType === 'none' ? undefined : departmentType as 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior',
      }),
    onSuccess: () => {
      toast({
        title: 'Login created',
        description: 'New department login has been created successfully.',
      });
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('admin');
      setDepartmentType('none');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to create login',
        description: err instanceof Error ? err.message : 'Please check details and try again.',
        variant: 'destructive',
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: (payload: { id: string; data: Partial<AdminUser> }) =>
      api.updateAdminUser(payload.id, {
        name: payload.data.name,
        phone: payload.data.phone,
        role: payload.data.role as 'admin' | 'superadmin' | undefined,
        isActive: payload.data.isActive,
        departmentType: payload.data.departmentType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.deleteAdminUser(id),
    onSuccess: () => {
      toast({
        title: 'Login removed',
        description: 'The login has been deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (payload: { id: string; password: string }) =>
      api.resetAdminUserPassword(payload.id, payload.password),
    onSuccess: () => {
      toast({
        title: 'Password reset',
        description: 'New password has been set for this login.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast({
        title: 'Missing fields',
        description: 'Name, email and password are required.',
        variant: 'destructive',
      });
      return;
    }
    createUser.mutate();
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Logins"
        description="Manage department logins for packing, billing and delivery from the super admin panel."
        icon={<KeyRound className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-100 p-4 grid gap-4 md:grid-cols-[1.8fr,2fr,1.5fr,1.5fr,1.5fr,auto]"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Packer / Biller / Delivery"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@store.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Phone (optional)</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit phone"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set initial password"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Department type</label>
            <Select
              value={departmentType}
              onValueChange={(v) =>
                setDepartmentType(v as 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior' | 'none')
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select department (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">General admin</SelectItem>
                <SelectItem value="packing">Packing</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="crm_head">CRM Head</SelectItem>
                <SelectItem value="crm_senior">CRM Senior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as 'admin' | 'superadmin')}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin (department login)</SelectItem>
                <SelectItem value="superadmin">Super admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={createUser.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create login
            </Button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="border-b px-4 py-2 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800">Existing logins</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">No admin logins found yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Phone</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Password</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Department</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Role</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Active</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: AdminUser) => {
                    const isEditing = user._id in editingPassword;
                    const isVisible = !!visiblePasswords[user._id];
                    const isSaving = !!savingPassword[user._id];
                    const isEditingPhone = user._id in editingPhone;
                    const isSavingPhone = !!savingPhone[user._id];
                    return (
                    <tr key={user._id} className="border-b last:border-0">
                      <td className="px-4 py-2">{user.name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">
                        {isEditingPhone ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 text-xs w-36"
                              value={editingPhone[user._id]}
                              onChange={(e) =>
                                setEditingPhone((prev) => ({ ...prev, [user._id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePhone(user._id);
                                if (e.key === 'Escape') cancelEditPhone(user._id);
                              }}
                              autoFocus
                              placeholder="10-digit phone"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600"
                              disabled={isSavingPhone}
                              onClick={() => savePhone(user._id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-500"
                              onClick={() => cancelEditPhone(user._id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-800 min-w-[80px]">
                              {user.phone || <span className="text-gray-400 italic">not set</span>}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-amber-600"
                              title="Edit phone"
                              onClick={() => startEditPhone(user)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 text-xs w-36"
                              value={editingPassword[user._id]}
                              onChange={(e) =>
                                setEditingPassword((prev) => ({ ...prev, [user._id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePassword(user._id);
                                if (e.key === 'Escape') cancelEdit(user._id);
                              }}
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600"
                              disabled={isSaving}
                              onClick={() => savePassword(user._id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-500"
                              onClick={() => cancelEdit(user._id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-gray-800 min-w-[80px]">
                              {user.plainPassword
                                ? isVisible
                                  ? user.plainPassword
                                  : '••••••••'
                                : <span className="text-gray-400 italic">not set</span>
                              }
                            </span>
                            {user.plainPassword && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-400"
                                onClick={() => toggleVisible(user._id)}
                              >
                                {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-amber-600"
                              title="Edit password"
                              onClick={() => startEdit(user)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {user.departmentType
                          ? user.departmentType === 'crm_head' ? 'CRM Head'
                          : user.departmentType === 'crm_senior' ? 'CRM Senior'
                          : <span className="capitalize">{user.departmentType}</span>
                          : '-'}
                      </td>
                      <td className="px-4 py-2 capitalize">{user.role}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.isActive}
                            onCheckedChange={(checked) =>
                              updateUser.mutate({
                                id: user._id,
                                data: { isActive: checked },
                              })
                            }
                          />
                          <span className="text-xs text-gray-500">
                            {user.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            title="Delete login"
                            onClick={() => setDeleteConfirmUser(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!deleteConfirmUser} onOpenChange={(open) => { if (!open) setDeleteConfirmUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Login</DialogTitle>
            <DialogDescription>
              Delete login for <strong>{deleteConfirmUser?.name}</strong> ({deleteConfirmUser?.email})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteUser.isPending}
              onClick={() => {
                if (deleteConfirmUser) {
                  deleteUser.mutate(deleteConfirmUser._id);
                  setDeleteConfirmUser(null);
                }
              }}
            >
              {deleteUser.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

