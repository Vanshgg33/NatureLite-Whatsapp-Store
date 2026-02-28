'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Eye, EyeOff, Phone, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore } from '@/lib/customer-store';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

type LoginMethod = 'email' | 'phone';

export default function LoginPage() {
  const router = useRouter();
  const { setCustomer, updateCustomer, lastVisitedPage } = useCustomerStore();
  const { syncWithServer: syncCart } = useCartStore();
  const { toast } = useToast();

  // Login method toggle
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone/OTP login state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  // Common state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Start OTP timer
  const startOtpTimer = () => {
    setOtpTimer(60);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Send OTP
  const handleSendOtp = async () => {
    if (!phone || phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await api.sendOtp(phone);

      setOtpSent(true);
      startOtpTimer();
      toast({
        title: 'OTP Sent',
        description: `Verification code sent to +91 ${phone}`,
      });
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle email/password login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.customerEmailLogin(email, password);

      if (typeof window !== 'undefined') {
        localStorage.setItem('customer-token', response.accessToken);
        if (response.refreshToken) {
          localStorage.setItem('customer-refresh-token', response.refreshToken);
        }
      }

      // Set initial customer data from auth response
      setCustomer({
        id: response.user.id,
        phone: response.user.phone || '',
        name: response.user.name,
        email: response.user.email,
        addresses: [],
        totalOrders: 0,
        totalSpent: 0,
      });

      // Fetch full profile (addresses, totalOrders, totalSpent)
      try {
        const profile = await api.getMyProfile();
        updateCustomer({
          name: profile.name || response.user.name,
          email: profile.email || response.user.email,
          phone: profile.phone || response.user.phone || '',
          addresses: profile.addresses || [],
          totalOrders: profile.totalOrders || 0,
          totalSpent: profile.totalSpent || 0,
        });
      } catch {
        // Profile fetch failed — continue with basic data
      }

      toast({
        title: 'Welcome back!',
        description: `Signed in as ${response.user.name || response.user.email}`,
      });

      // Sync cart with server after login
      await syncCart();

      router.push(lastVisitedPage || '/account');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Handle phone/OTP login
  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpSent) {
      handleSendOtp();
      return;
    }

    if (!otp || otp.length < 4) {
      setError('Please enter a valid OTP');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.customerLogin(phone, otp);

      if (typeof window !== 'undefined') {
        localStorage.setItem('customer-token', response.accessToken);
        if (response.refreshToken) {
          localStorage.setItem('customer-refresh-token', response.refreshToken);
        }
      }

      // Set initial customer data from auth response
      setCustomer({
        id: response.user.id,
        phone: response.user.phone || phone,
        name: response.user.name,
        email: response.user.email,
        addresses: [],
        totalOrders: 0,
        totalSpent: 0,
      });

      // Fetch full profile (addresses, totalOrders, totalSpent)
      try {
        const profile = await api.getMyProfile();
        updateCustomer({
          name: profile.name || response.user.name,
          email: profile.email || response.user.email,
          phone: profile.phone || response.user.phone || phone,
          addresses: profile.addresses || [],
          totalOrders: profile.totalOrders || 0,
          totalSpent: profile.totalSpent || 0,
        });
      } catch {
        // Profile fetch failed — continue with basic data
      }

      toast({
        title: 'Welcome!',
        description: `Signed in with +91 ${phone}`,
      });

      // Sync cart with server after login
      await syncCart();

      router.push(lastVisitedPage || '/account');
    } catch (err) {
      setError('Invalid OTP. Please try again.');
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
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-full bg-brand-mustard flex items-center justify-center">
                <Leaf className="w-6 h-6 text-white" />
              </div>
            </Link>
            <h1 className="text-2xl font-serif font-bold text-brand-charcoal">
              Welcome Back
            </h1>
            <p className="text-brand-brown mt-2">
              Sign in to your account
            </p>
          </div>

          {/* Login Method Toggle */}
          <div className="flex bg-brand-cream rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setLoginMethod('email');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                loginMethod === 'email'
                  ? 'bg-white text-brand-charcoal shadow-sm'
                  : 'text-brand-brown hover:text-brand-charcoal'
              }`}
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('phone');
                setError('');
                setOtpSent(false);
                setOtp('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                loginMethod === 'phone'
                  ? 'bg-white text-brand-charcoal shadow-sm'
                  : 'text-brand-brown hover:text-brand-charcoal'
              }`}
            >
              <Phone className="w-4 h-4" />
              Phone
            </button>
          </div>

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email Login Form */}
          <AnimatePresence mode="wait">
            {loginMethod === 'email' ? (
              <motion.form
                key="email-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleEmailLogin}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm text-brand-charcoal mb-1.5 block font-medium">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="rounded-xl border-brand-border focus:border-brand-mustard focus:ring-brand-mustard"
                  />
                </div>

                <div>
                  <label className="text-sm text-brand-charcoal mb-1.5 block font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="rounded-xl pr-10 border-brand-border focus:border-brand-mustard focus:ring-brand-mustard"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-brown hover:text-brand-charcoal"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-brand-border text-brand-mustard focus:ring-brand-mustard"
                    />
                    <span className="text-sm text-brand-brown">Remember me</span>
                  </label>
                  <Link href="/forgot-password" className="text-sm text-brand-mustard hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-brand-charcoal hover:bg-brand-charcoal-dark text-white rounded-xl py-6"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="phone-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleOtpLogin}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm text-brand-charcoal mb-1.5 block font-medium">
                    Phone Number
                  </label>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 bg-brand-cream rounded-xl border border-brand-border text-brand-brown text-sm">
                      +91
                    </div>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhone(value);
                        if (otpSent) setOtpSent(false);
                      }}
                      placeholder="9876543210"
                      required
                      maxLength={10}
                      disabled={otpSent}
                      className="rounded-xl border-brand-border focus:border-brand-mustard focus:ring-brand-mustard"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {otpSent && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="text-sm text-brand-charcoal mb-1.5 block font-medium">
                        Enter OTP
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Enter 6-digit OTP"
                          required
                          maxLength={6}
                          className="rounded-xl border-brand-border focus:border-brand-mustard focus:ring-brand-mustard text-center tracking-widest text-lg"
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-brand-brown">
                          Didn&apos;t receive OTP?
                        </span>
                        {otpTimer > 0 ? (
                          <span className="text-xs text-brand-brown">
                            Resend in {otpTimer}s
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            className="text-xs text-brand-mustard hover:underline font-medium"
                          >
                            Resend OTP
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  className="w-full bg-brand-charcoal hover:bg-brand-charcoal-dark text-white rounded-xl py-6 flex items-center justify-center gap-2"
                  disabled={loading || (otpSent && otp.length < 4)}
                >
                  {loading ? (
                    'Please wait...'
                  ) : otpSent ? (
                    'Verify & Sign In'
                  ) : (
                    <>
                      Send OTP <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>

                {otpSent && (
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setError('');
                    }}
                    className="w-full text-sm text-brand-brown hover:text-brand-charcoal"
                  >
                    Change phone number
                  </button>
                )}
              </motion.form>
            )}
          </AnimatePresence>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-brand-brown">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-brand-mustard hover:underline font-medium">
                Create account
              </Link>
            </p>
          </div>

          {/* Admin Link */}
          <div className="mt-8 pt-6 border-t border-brand-border">
            <p className="text-xs text-brand-brown text-center">
              Admin access?{' '}
              <Link href="/admin-login" className="text-brand-charcoal hover:underline">
                Admin Login
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
