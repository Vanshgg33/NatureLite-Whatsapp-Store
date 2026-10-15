'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';

export default function FmsChangePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, setUser } = useAdminAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    if (next.length < 8) { toast({ title: 'Min 8 characters', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      if (user) setUser({ ...user, mustChangePassword: false });
      toast({ title: 'Password changed' });
      router.replace('/fms/purchase');
    } catch (err) {
      toast({ title: 'Error', description: getApiError(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F6F2' }}>
      <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-8 w-full max-w-sm shadow-[0_2px_8px_rgba(24,33,28,.08)]">
        <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C] mb-1">Set your password</h1>
        <p className="text-xs text-[#66706A] font-jakarta mb-6">Your account requires a password change before you can continue.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Current (temp) password</label>
            <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="h-9 text-sm font-jakarta" required />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">New password</label>
            <Input type="password" value={next} onChange={e => setNext(e.target.value)} className="h-9 text-sm font-jakarta" required minLength={8} />
          </div>
          <div>
            <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Confirm new password</label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="h-9 text-sm font-jakarta" required />
          </div>
          <Button type="submit" className="w-full h-10 text-sm text-white font-jakarta" style={{ background: '#1E5E3F' }} disabled={loading}>
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
