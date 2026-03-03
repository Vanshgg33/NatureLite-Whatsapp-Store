'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Building2, Check, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Store } from '@/types';

export default function StoresPage() {
  const queryClient = useQueryClient();
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '' });
  const [passwordStore, setPasswordStore] = useState<Store | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; code: string; address?: string; phone?: string }) =>
      api.createStore(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      setShowCreate(false);
      setForm({ name: '', code: '', address: '', phone: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateStore(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      setEditStore(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ storeId, password }: { storeId: string; password: string }) =>
      api.resetStorePassword(storeId, password),
    onSuccess: (data) => {
      setPasswordSuccess(data.message);
      setNewPassword('');
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Stores</h1>
          <p className="text-gray-500 mt-1">View and manage your physical store locations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Store
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => (
          <Card key={store._id} className="relative overflow-hidden">
            {store.isMainStore && (
              <div className="absolute top-3 right-3">
                <Badge variant="default" className="bg-primary">
                  <Check className="mr-1 h-3 w-3" />
                  Main Store
                </Badge>
              </div>
            )}
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{store.name}</CardTitle>
                  <p className="text-sm text-gray-500">Code: {store.code}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {store.address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{store.address}</span>
                </div>
              )}
              {store.phone && (
                <p className="text-sm text-gray-600">Phone: {store.phone}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t">
                <Badge variant={store.isActive ? 'default' : 'secondary'}>
                  {store.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPasswordStore(store);
                      setNewPassword('');
                      setPasswordSuccess('');
                      resetPasswordMutation.reset();
                    }}
                  >
                    <KeyRound className="mr-1 h-3 w-3" />
                    Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditStore(store);
                      setEditForm({ name: store.name, address: store.address || '', phone: store.phone || '' });
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t mt-2">
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">Email:</span> {store.adminEmail || `${store.code}@naturelite.com`}
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-500">
                    <span className="text-gray-400">Password:</span>{' '}
                    {visiblePasswords[store._id]
                      ? (store.adminPassword || 'Store@123')
                      : '••••••••'}
                  </p>
                  <button
                    onClick={() => setVisiblePasswords((prev) => ({ ...prev, [store._id]: !prev[store._id] }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {visiblePasswords[store._id]
                      ? <EyeOff className="h-3 w-3" />
                      : <Eye className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Store Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Store</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Store Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Nagpur"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Store Code</label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                placeholder="e.g. nagpur"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Store address"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Store phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || !form.code || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Store'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!passwordStore} onOpenChange={() => setPasswordStore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password - {passwordStore?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-500">
              Set a new password for <span className="font-medium">{passwordStore?.code}@naturelite.com</span>
            </p>
            {passwordSuccess && (
              <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
                {passwordSuccess}
              </div>
            )}
            {resetPasswordMutation.isError && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
                Failed to update password. Please try again.
              </div>
            )}
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordStore(null)}>
              {passwordSuccess ? 'Done' : 'Cancel'}
            </Button>
            {!passwordSuccess && (
              <Button
                onClick={() => {
                  if (!passwordStore) return;
                  resetPasswordMutation.mutate({ storeId: passwordStore._id, password: newPassword });
                }}
                disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Store Dialog */}
      <Dialog open={!!editStore} onOpenChange={() => setEditStore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editStore?.name}</DialogTitle>
          </DialogHeader>
          {editStore && (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Store Name</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStore(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editStore) return;
                updateMutation.mutate({ id: editStore._id, data: editForm });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
