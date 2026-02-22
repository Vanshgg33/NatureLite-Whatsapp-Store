'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Package, MapPin, Heart, ArrowRight, User, Edit2, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

export default function AccountDashboardPage() {
  const { customer, updateCustomer } = useCustomerStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleStartEdit = () => {
    setEditForm({
      name: customer?.name || '',
      email: customer?.email || '',
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({
      name: customer?.name || '',
      email: customer?.email || '',
    });
  };

  const handleSaveProfile = async () => {
    if (!editForm.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your name',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const updatedUser = await api.updateMyProfile({
        name: editForm.name.trim(),
        email: editForm.email.trim() || undefined,
      });

      updateCustomer({
        name: updatedUser.name,
        email: updatedUser.email,
      });

      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: 'Could not update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-2">
          Welcome back, {customer?.name?.split(' ')[0] || 'there'}!
        </h1>
        <p className="font-body text-brand-muted">
          Manage your orders, addresses, and account settings.
        </p>
      </motion.div>

      {/* Profile Section */}
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-brand-charcoal flex items-center gap-2">
            <User className="w-5 h-5 text-brand-mustard" />
            Profile Information
          </h2>
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              className="text-brand-mustard hover:text-brand-mustard-dark flex items-center gap-1 font-body text-sm"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="text-brand-muted hover:text-brand-charcoal flex items-center gap-1 font-body text-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="text-brand-green hover:text-brand-green/80 flex items-center gap-1 font-body text-sm"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        {!isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-brand-mustard/10 flex items-center justify-center">
                <span className="font-display text-2xl font-bold text-brand-mustard">
                  {customer?.name?.[0]?.toUpperCase() || customer?.email?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <div>
                <p className="font-display font-semibold text-brand-charcoal text-lg">
                  {customer?.name || 'No name set'}
                </p>
                <p className="font-body text-sm text-brand-muted">
                  {customer?.email || 'No email set'}
                </p>
                <p className="font-body text-sm text-brand-muted">
                  {customer?.phone}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Full Name
              </label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter your name"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Email
              </label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter your email"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Phone
              </label>
              <Input
                value={customer?.phone || ''}
                disabled
                className="bg-brand-sand cursor-not-allowed"
              />
              <p className="text-xs text-brand-muted mt-1">
                Phone number cannot be changed
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Total Orders',
            value: customer?.totalOrders || 0,
            icon: Package,
            href: '/account/orders',
          },
          {
            label: 'Total Spent',
            value: formatPrice(customer?.totalSpent || 0),
            icon: Heart,
            href: '/account/orders',
          },
          {
            label: 'Saved Addresses',
            value: customer?.addresses?.length || 0,
            icon: MapPin,
            href: '/account/addresses',
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + 0.05 * index }}
          >
            <Link href={stat.href}>
              <div className="bg-white rounded-2xl p-6 shadow-brand-sm hover:shadow-brand-md transition-shadow group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-mustard/10 flex items-center justify-center">
                    <stat.icon className="w-6 h-6 text-brand-mustard" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-brand-muted group-hover:text-brand-mustard transition-colors" />
                </div>
                <p className="font-display text-2xl font-bold text-brand-charcoal">
                  {stat.value}
                </p>
                <p className="font-body text-sm text-brand-muted">{stat.label}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-4">
          Quick Actions
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/products">
            <Button
              variant="outline"
              className="w-full justify-start border-brand-border hover:bg-brand-sand"
            >
              <Package className="w-5 h-5 mr-3 text-brand-mustard" />
              Browse Products
            </Button>
          </Link>
          <Link href="/account/addresses">
            <Button
              variant="outline"
              className="w-full justify-start border-brand-border hover:bg-brand-sand"
            >
              <MapPin className="w-5 h-5 mr-3 text-brand-mustard" />
              Manage Addresses
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Default Address */}
      {customer?.addresses && customer.addresses.length > 0 && (
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-brand-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold text-brand-charcoal">
              Default Address
            </h2>
            <Link
              href="/account/addresses"
              className="font-body text-sm text-brand-mustard hover:underline"
            >
              Edit
            </Link>
          </div>
          {(() => {
            const defaultAddress =
              customer.addresses.find((a) => a.isDefault) || customer.addresses[0];
            return (
              <div className="font-body text-brand-text">
                <p className="font-medium">{defaultAddress.label}</p>
                <p className="text-sm text-brand-muted mt-1">
                  {defaultAddress.street}
                  {defaultAddress.landmark && `, ${defaultAddress.landmark}`}
                </p>
                <p className="text-sm text-brand-muted">
                  {defaultAddress.city}, {defaultAddress.state} - {defaultAddress.pincode}
                </p>
              </div>
            );
          })()}
        </motion.div>
      )}
    </div>
  );
}
