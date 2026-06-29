'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { AuthBrandingPanel } from '@/components/admin/auth-branding-panel';

export default function AdminLoginPage() {
  const router = useRouter();
  const { setUser, setTokens, isAuthenticated, hasHydrated, user } = useAdminAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      });
      setTokens(response.accessToken, response.refreshToken);
      
      if (response.user.departmentType === 'packing') {
        router.push('/department/packing');
      } else if (response.user.departmentType === 'billing') {
        router.push('/department/billing');
      } else if (response.user.departmentType === 'delivery') {
        router.push('/department/delivery');
      } else {
        router.push('/admin/dashboard');
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-brand-cream via-white to-brand-cream/80">
      <AuthBrandingPanel />

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 lg:py-0"
      >
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-brand-border/60 p-6 sm:p-8 space-y-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-brand-charcoal">Store owner access</h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Sign in to manage products, orders, payments and analytics.
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1 text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[11px] font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  Secure admin
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-1 text-[11px] font-medium">
                  24×7 live orders
                </span>
              </div>
            </div>

            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-brand-charcoal">
                  Admin email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@yourstore.com"
                    required
                    className="pl-10 h-12 rounded-xl border-brand-border focus-visible:ring-brand-green"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-brand-charcoal">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="pl-10 h-12 rounded-xl border-brand-border focus-visible:ring-brand-green"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-full bg-brand-green hover:bg-brand-green-light text-white font-medium text-base shadow-sm hover:shadow-md"
              style={{ transition: 'background-color 0.1s, opacity 0.1s, box-shadow 0.15s' }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Sign in to admin
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>

              <div className="flex items-center justify-end pt-2 border-t border-dashed border-brand-border/60 mt-2">
                <button
                  type="button"
                  onClick={() => router.push('/department-login')}
                  className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-charcoal"
                  style={{ transition: 'color 0.1s' }}
                >
                  <Users className="w-3.5 h-3.5" />
                  Staff / department login
                </button>
              </div>
            </motion.form>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
