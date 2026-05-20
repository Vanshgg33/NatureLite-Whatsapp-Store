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
    queryKey: ['my-orders', 'dashboard'],
    queryFn: () => api.getMyOrders(100),
    enabled: isAuthenticated,
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

  return (
    <div className="space-y-4">
      {/* ── Welcome Banner ─────────────────────────────────────────────────── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Rich warm gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)',
          }}
        />
        {/* Grain */}
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
            width: 320,
            height: 320,
            background:
              'radial-gradient(circle,rgba(212,152,64,0.28) 0%,transparent 65%)',
            filter: 'blur(32px)',
          }}
        />

        <div className="relative px-6 py-6 flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(212,152,64,0.18)',
              boxShadow: '0 0 0 2px rgba(212,152,64,0.30)',
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
                letterSpacing: '0.30em',
                textTransform: 'uppercase',
                color: 'rgba(212,152,64,0.60)',
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              My Account
            </p>
            <h1
              className="font-display font-bold leading-tight"
              style={{ color: '#f5e8cc', fontSize: '1.35rem' }}
            >
              Welcome back,{' '}
              <span style={{ color: '#d49840' }}>
                {dashboardCustomer?.name?.split(' ')[0] || 'there'}
              </span>
              !
            </h1>
            <p
              className="font-body text-sm mt-0.5"
              style={{ color: 'rgba(245,232,204,0.45)' }}
            >
              {dashboardCustomer?.phone || dashboardCustomer?.email || 'Manage your account'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
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
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 * (i + 1), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={stat.href}>
              <div className="bg-white rounded-xl px-4 py-4 shadow-brand-sm hover:shadow-brand-md transition-all duration-200 group border border-transparent hover:border-brand-border">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand-mustard/10 flex items-center justify-center">
                    <stat.Icon className="w-4 h-4 text-brand-mustard" />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-brand-muted/30 group-hover:text-brand-mustard group-hover:translate-x-0.5 transition-all duration-200" />
                </div>
                {stat.value === null ? (
                  <div className="h-6 w-12 bg-brand-sand rounded animate-pulse mb-1" />
                ) : (
                  <p className="font-display text-xl font-bold text-brand-charcoal leading-none mb-1">
                    {stat.value}
                  </p>
                )}
                <p className="font-body text-xs text-brand-muted">{stat.label}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Profile ────────────────────────────────────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="px-5 py-3.5 border-b border-brand-border flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-brand-charcoal flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-brand-mustard" />
            Profile Information
          </span>
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

        <div className="px-5 py-4">
          {!isEditing ? (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Name', value: dashboardCustomer?.name || '—' },
                { label: 'Email', value: dashboardCustomer?.email || '—' },
                { label: 'Phone', value: dashboardCustomer?.phone || '—' },
              ].map((field) => (
                <div key={field.label}>
                  <p
                    className="font-body mb-1"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'hsl(var(--brand-muted))',
                    }}
                  >
                    {field.label}
                  </p>
                  <p className="font-body text-sm font-medium text-brand-charcoal break-all">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid sm:grid-cols-2 gap-3.5">
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

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm p-4"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="font-body mb-3"
          style={{
            fontSize: 9,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'hsl(var(--brand-muted))',
          }}
        >
          Quick Actions
        </p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {[
            { href: '/products', Icon: ShoppingBag, label: 'Browse Products' },
            { href: '/account/addresses', Icon: MapPin, label: 'Manage Addresses' },
          ].map(({ href, Icon, label }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-brand-border hover:border-brand-mustard/40 hover:bg-brand-mustard/4 transition-all duration-200 group">
                <div className="w-7 h-7 rounded-lg bg-brand-mustard/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-brand-mustard" />
                </div>
                <span className="font-body text-sm text-brand-text group-hover:text-brand-charcoal">
                  {label}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-brand-muted/30 group-hover:text-brand-mustard ml-auto transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Default Address ────────────────────────────────────────────────── */}
      {customer?.addresses && customer.addresses.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.37, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="px-5 py-3.5 border-b border-brand-border flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-brand-charcoal flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-brand-mustard" />
              Default Delivery Address
            </span>
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
              <div className="px-5 py-4">
                <p className="font-body text-sm font-semibold text-brand-charcoal">{addr.label}</p>
                <p className="font-body text-sm text-brand-muted mt-0.5">{addr.street}</p>
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
