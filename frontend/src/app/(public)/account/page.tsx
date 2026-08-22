'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  MapPin,
  IndianRupee,
  ArrowRight,
  User,
  Edit2,
  Loader2,
  Check,
  X,
  ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

export default function AccountDashboardPage() {
  const { customer, isAuthenticated, updateCustomer } = useCustomerStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
  });

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api.getMyProfile(),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const { data: recentOrders = [], isLoading: isOrdersLoading } = useQuery({
    queryKey: ['my-orders', customer?.id],
    queryFn: () => api.getMyOrders(100),
    enabled: isAuthenticated && !!customer?.id,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!profile) return;
    updateCustomer({
      name: profile.name,
      email: profile.email,
      phone: profile.phone || '',
      addresses: profile.addresses || [],
      totalOrders: profile.totalOrders || 0,
      totalSpent: profile.totalSpent || 0,
    });
    if (!isEditing) {
      setEditForm({ name: profile.name || '', email: profile.email || '' });
    }
  }, [isEditing, profile, updateCustomer]);

  const dashboardCustomer = profile ? { ...customer, ...profile } : customer;

  const orderStats = useMemo(() => {
    const fetchedOrderCount = recentOrders.length;
    const fetchedTotalSpent = recentOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );
    return {
      totalOrders: Math.max(dashboardCustomer?.totalOrders || 0, fetchedOrderCount),
      totalSpent: Math.max(dashboardCustomer?.totalSpent || 0, fetchedTotalSpent),
      savedAddresses: dashboardCustomer?.addresses?.length || 0,
    };
  }, [
    dashboardCustomer?.addresses?.length,
    dashboardCustomer?.totalOrders,
    dashboardCustomer?.totalSpent,
    recentOrders,
  ]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  const handleStartEdit = () => {
    setEditForm({ name: customer?.name || '', email: customer?.email || '' });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({ name: customer?.name || '', email: customer?.email || '' });
  };

  const handleSaveProfile = async () => {
    if (!editForm.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter your name', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const updatedUser = await api.updateMyProfile({
        name: editForm.name.trim(),
        email: editForm.email.trim() || undefined,
      });
      updateCustomer({ name: updatedUser.name, email: updatedUser.email });
      setIsEditing(false);
      toast({ title: 'Profile updated', description: 'Your profile has been saved successfully.' });
    } catch {
      toast({
        title: 'Update failed',
        description: 'Could not update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isProfileLoading || isOrdersLoading;

  const stats = [
    {
      label: 'Orders',
      value: isLoading ? null : orderStats.totalOrders,
      Icon: Package,
      href: '/account/orders',
    },
    {
      label: 'Total Spent',
      value: isLoading ? null : formatPrice(orderStats.totalSpent),
      Icon: IndianRupee,
      href: '/account/orders',
    },
    {
      label: 'Addresses',
      value: isProfileLoading ? null : orderStats.savedAddresses,
      Icon: MapPin,
      href: '/account/addresses',
    },
  ];

  return (
    <div className="space-y-4">

      {/* ── Hero Card: Welcome + Stats ──────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Dark gradient top */}
        <div
          className="relative px-6 py-6 overflow-hidden"
          style={{
            background:
              'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)',
          }}
        >
          {/* Grain overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              mixBlendMode: 'overlay',
            }}
          />
          {/* Glow orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              top: '-40%',
              right: '-5%',
              width: 280,
              height: 280,
              background: 'radial-gradient(circle,rgba(212,152,64,0.25) 0%,transparent 65%)',
              filter: 'blur(28px)',
            }}
          />

          <div className="relative flex items-center gap-4">
            {/* Square avatar */}
            <div
              className="rounded-2xl flex items-center justify-center shrink-0"
              style={{
                width: 60,
                height: 60,
                background: 'rgba(212,152,64,0.18)',
                border: '1.5px solid rgba(212,152,64,0.32)',
              }}
            >
              <span className="font-display text-2xl font-bold" style={{ color: '#d49840' }}>
                {dashboardCustomer?.name?.[0]?.toUpperCase() ||
                  dashboardCustomer?.email?.[0]?.toUpperCase() ||
                  'U'}
              </span>
            </div>

            <div>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: 'rgba(212,152,64,0.55)',
                  fontFamily: 'monospace',
                  marginBottom: 4,
                }}
              >
                My Account
              </p>
              <h1
                className="font-display font-bold leading-tight"
                style={{ color: '#f5e8cc', fontSize: '1.4rem' }}
              >
                {dashboardCustomer?.name || dashboardCustomer?.email?.split('@')[0] || 'Welcome'}
              </h1>
              <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(245,232,204,0.45)' }}>
                {dashboardCustomer?.phone || dashboardCustomer?.email || 'Manage your account'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats row — divided, no separate cards */}
        <div className="grid grid-cols-3 divide-x divide-brand-border/60">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href}>
              <div className="px-4 py-4 hover:bg-brand-sand/50 transition-colors group cursor-pointer">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <stat.Icon className="w-3.5 h-3.5 text-brand-mustard/70" />
                  <p className="font-body text-xs text-brand-muted">{stat.label}</p>
                </div>
                {stat.value === null ? (
                  <div className="h-7 w-14 bg-brand-sand rounded animate-pulse" />
                ) : (
                  <p className="font-display text-xl font-bold text-brand-charcoal leading-none">
                    {stat.value}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Profile Information ─────────────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-mustard/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-brand-mustard" />
            </div>
            <span className="font-display text-sm font-semibold text-brand-charcoal">
              Profile Information
            </span>
          </div>
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              className="text-brand-mustard hover:text-brand-mustard-dark flex items-center gap-1.5 font-body text-xs transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              Edit
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="text-brand-muted hover:text-brand-charcoal flex items-center gap-1 font-body text-xs transition-colors"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="text-brand-green flex items-center gap-1 font-body text-xs font-medium"
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {[
                { label: 'Name', value: dashboardCustomer?.name || '—' },
                { label: 'Email', value: dashboardCustomer?.email || '—' },
                { label: 'Phone', value: dashboardCustomer?.phone || '—' },
              ].map((field) => (
                <div key={field.label}>
                  <p className="font-body text-xs text-brand-muted mb-1.5 uppercase tracking-wide">
                    {field.label}
                  </p>
                  <p className="font-body text-sm font-medium text-brand-charcoal break-all">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-body text-xs text-brand-text mb-1.5 block">Full Name</label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Enter your name"
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="font-body text-xs text-brand-text mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="Enter your email"
                    disabled={isSaving}
                  />
                </div>
              </div>
              <div>
                <label className="font-body text-xs text-brand-text mb-1.5 block">Phone</label>
                <Input
                  value={dashboardCustomer?.phone || ''}
                  disabled
                  className="bg-brand-sand/60 cursor-not-allowed text-brand-muted"
                />
                <p className="text-xs text-brand-muted mt-1">Phone number cannot be changed</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="px-6 py-4 border-b border-brand-border">
          <span className="font-display text-sm font-semibold text-brand-charcoal">
            Quick Actions
          </span>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3">
          {[
            {
              href: '/products',
              Icon: ShoppingBag,
              label: 'Browse Products',
              desc: 'Explore our premium collection',
            },
            {
              href: '/account/addresses',
              Icon: MapPin,
              label: 'Manage Addresses',
              desc: 'Add or edit delivery locations',
            },
          ].map(({ href, Icon, label, desc }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-3.5 px-4 py-4 rounded-xl border border-brand-border hover:border-brand-mustard/40 hover:bg-brand-mustard/5 transition-all duration-200 group">
                <div className="w-10 h-10 rounded-xl bg-brand-mustard/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-mustard" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-medium text-brand-charcoal">{label}</p>
                  <p className="font-body text-xs text-brand-muted mt-0.5">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-muted/30 group-hover:text-brand-mustard group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Default Address ─────────────────────────────────────── */}
      {customer?.addresses && customer.addresses.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-mustard/10 flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-brand-mustard" />
              </div>
              <span className="font-display text-sm font-semibold text-brand-charcoal">
                Default Delivery Address
              </span>
            </div>
            <Link
              href="/account/addresses"
              className="font-body text-xs text-brand-mustard hover:text-brand-mustard-dark transition-colors"
            >
              Edit
            </Link>
          </div>
          {(() => {
            const addr =
              customer.addresses.find((a) => a.isDefault) || customer.addresses[0];
            return (
              <div className="px-6 py-5">
                <p className="font-body text-sm font-semibold text-brand-charcoal">{addr.label}</p>
                <p className="font-body text-sm text-brand-muted mt-1">{addr.street}</p>
                {addr.landmark && (
                  <p className="font-body text-sm text-brand-muted">{addr.landmark}</p>
                )}
                <p className="font-body text-sm text-brand-muted">
                  {addr.city}, {addr.state} — {addr.pincode}
                </p>
              </div>
            );
          })()}
        </motion.div>
      )}
    </div>
  );
}
