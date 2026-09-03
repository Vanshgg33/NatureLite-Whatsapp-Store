'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, ArrowRight, Package, FileText, Truck, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';

type DepartmentTarget = 'packing' | 'billing' | 'delivery';

export default function DepartmentLoginPage() {
  const router = useRouter();
  const { setUser, setTokens, isAuthenticated, hasHydrated, user } = useAdminAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<DepartmentTarget>('packing');

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    const dept = user?.departmentType;
    if (dept === 'packing') router.replace('/department/packing');
    else if (dept === 'billing') router.replace('/department/billing');
    else if (dept === 'delivery') router.replace('/department/delivery');
    else router.replace('/admin/dashboard');
  }, [hasHydrated, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(email, password);
      setUser({
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        role: response.user.role,
        storeId: response.user.storeId,
        storeName: response.user.storeName,
        departmentType: response.user.departmentType,
        purchaseRole: response.user.purchaseRole,
      });
      setTokens(response.accessToken, response.refreshToken);

      const dept = response.user.departmentType as DepartmentTarget | 'crm_head' | 'crm_senior' | undefined;

      if (dept === 'packing') {
        router.push('/department/packing');
      } else if (dept === 'billing') {
        router.push('/department/billing');
      } else if (dept === 'delivery') {
        router.push('/department/delivery');
      } else {
        // crm_head, crm_senior, and regular admins all use the admin panel
        router.push('/admin/dashboard');
      }
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid md:grid-cols-[1.1fr,0.9fr] gap-8 bg-white rounded-3xl shadow-brand-lg overflow-hidden">
        {/* Left: form */}
        <div className="p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-brand-mustard flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-brand-charcoal">
                Team access
              </h1>
              <p className="text-xs sm:text-sm font-body text-brand-muted">
                Sign in to your store department workspace.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-100">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-brand-charcoal">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="team.member@store.com"
                  required
                  className="pl-9 h-11 rounded-xl border-brand-border focus-visible:ring-brand-mustard"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-brand-charcoal">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="pl-9 h-11 rounded-xl border-brand-border focus-visible:ring-brand-mustard"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-brand-charcoal">Department</p>
              <p className="text-xs text-brand-muted mb-1">
                Choose your station. If your account already has a department, that will be used automatically.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={target === 'packing' ? 'default' : 'outline'}
                  className="h-10 flex items-center justify-center gap-1 text-[11px] rounded-full"
                  onClick={() => setTarget('packing')}
                >
                  <Package className="h-4 w-4" />
                  Packing
                </Button>
                <Button
                  type="button"
                  variant={target === 'billing' ? 'default' : 'outline'}
                  className="h-10 flex items-center justify-center gap-1 text-[11px] rounded-full"
                  onClick={() => setTarget('billing')}
                >
                  <FileText className="h-4 w-4" />
                  Billing
                </Button>
                <Button
                  type="button"
                  variant={target === 'delivery' ? 'default' : 'outline'}
                  className="h-10 flex items-center justify-center gap-1 text-[11px] rounded-full"
                  onClick={() => setTarget('delivery')}
                >
                  <Truck className="h-4 w-4" />
                  Delivery
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-full flex items-center justify-center gap-2 bg-brand-charcoal hover:bg-brand-brown text-white"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Continue to{' '}
                  {target === 'packing' ? 'Packing' : target === 'billing' ? 'Billing' : 'Delivery'} dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right: info panel */}
        <div className="bg-gradient-to-br from-brand-mustard via-brand-terracotta to-brand-brown text-white p-8 sm:p-10 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-white" />
              <div>
                <h2 className="text-xl font-display font-semibold">Smooth order handoff</h2>
                <p className="text-sm font-body text-white/80">
                  Each department gets a focused dashboard so orders move from cart to doorstep without friction.
                </p>
              </div>
            </div>
            <ul className="space-y-3 text-sm font-body">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white" />
                <span>
                  <strong>Packing</strong>: confirm items for orders in preparing, then hand off to billing for dispatch.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white" />
                <span>
                  <strong>Billing</strong>: auto-updated queue of packed orders, with quick invoice and payment updates.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white" />
                <span>
                  <strong>Delivery</strong>: record payment method, upload proof, and close the delivery loop cleanly.
                </span>
              </li>
            </ul>
          </div>
          <p className="text-xs text-white/80 font-body">
            Access is restricted to authorised team members. If you&apos;re not sure which login to use, contact your
            store admin.
          </p>
        </div>
      </div>
    </div>
  );
}

