'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Leaf, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore } from '@/lib/customer-store';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';

export default function RegisterPage() {
  const router = useRouter();
  const { setCustomer, updateCustomer, setTokens } = useCustomerStore();
  const { syncWithServer: syncCart } = useCartStore();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await api.customerRegister({
        name,
        email,
        password,
        phone: phone || undefined,
      });

      setTokens(response.accessToken, response.refreshToken);
      setCustomer({
        id: response.user.id,
        phone: response.user.phone || phone,
        name: response.user.name || name,
        email: response.user.email || email,
        addresses: [],
        totalOrders: 0,
        totalSpent: 0,
      });

      // Fetch full profile (addresses, totalOrders, totalSpent)
      try {
        const profile = await api.getMyProfile();
        updateCustomer({
          name: profile.name || response.user.name || name,
          email: profile.email || response.user.email || email,
          phone: profile.phone || response.user.phone || phone,
          addresses: profile.addresses || [],
          totalOrders: profile.totalOrders || 0,
          totalSpent: profile.totalSpent || 0,
        });
      } catch {
        // Profile fetch failed — continue with basic data
      }

      toast({
        title: 'Account created!',
        description: 'Welcome to Purity Foods!',
      });

      // Sync cart with server after registration
      await syncCart();

      router.push('/account');
    } catch (err: unknown) {
      setError(getApiError(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 bg-brand-cream flex items-center justify-center py-12 px-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white rounded-2xl p-8 shadow-brand-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-full bg-brand-mustard flex items-center justify-center">
                <Leaf className="w-6 h-6 text-white" />
              </div>
            </Link>
            <h1 className="font-display text-2xl font-bold text-brand-charcoal">
              Create Account
            </h1>
            <p className="font-body text-brand-muted mt-2">
              Join our community of food lovers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-brand-error/10 text-brand-error text-sm p-3 rounded-xl font-body">
                {error}
              </div>
            )}

            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Full Name
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Phone (Optional)
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 99999 99999"
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-charcoal"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl py-6"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="font-body text-sm text-brand-muted">
              Already have an account?{' '}
              <Link href="/login" className="text-brand-mustard hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
