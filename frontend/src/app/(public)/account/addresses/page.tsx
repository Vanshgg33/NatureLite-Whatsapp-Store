'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Plus, Edit2, Trash2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore, useDefaultAddress } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { Address } from '@/types';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

const SERVICEABLE_PREFIXES = ['492', '490', '491', '495'];

const addressSchema = z.object({
  label: z.string().optional(),
  street: z.string().min(5, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z
    .string()
    .min(6, 'Valid pincode is required')
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits')
    .refine(
      (val) => SERVICEABLE_PREFIXES.some((p) => val.startsWith(p)),
      'Sorry, we currently deliver only to Raipur, Bhilai, Durg & Bilaspur (Chhattisgarh).',
    ),
  landmark: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export default function AddressesPage() {
  const { customer, isAuthenticated, addAddress, updateAddress, removeAddress, setDefaultAddress, setCustomer, updateCustomer } =
    useCustomerStore();
  const defaultAddress = useDefaultAddress();
  const { toast } = useToast();

  const { data: profile } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api.getMyProfile(),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!profile) return;
    updateCustomer({ addresses: profile.addresses || [] });
  }, [profile, updateCustomer]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof z.infer<typeof addressSchema>, string>>
  >({});
  const [formData, setFormData] = useState<Partial<Address>>({
    label: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
    isDefault: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = addressSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof z.infer<typeof addressSchema>, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as keyof z.infer<typeof addressSchema>;
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      setErrors(fieldErrors);
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    const safe = parsed.data;
    const address: Address = {
      label: safe.label || 'Home',
      street: safe.street,
      city: safe.city,
      state: safe.state,
      pincode: safe.pincode,
      landmark: safe.landmark,
      isDefault: safe.isDefault || false,
    };

    try {
      if (editingIndex !== null) {
        const updatedUser = await api.updateAddress(editingIndex, address);
        updateAddress(editingIndex, address);
        if (updatedUser.addresses && customer)
          setCustomer({ ...customer, addresses: updatedUser.addresses });
        toast({ title: 'Address updated' });
      } else {
        const updatedUser = await api.addAddress(address);
        addAddress(address);
        if (updatedUser.addresses && customer)
          setCustomer({ ...customer, addresses: updatedUser.addresses });
        toast({ title: 'Address added' });
      }
      resetForm();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save address. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ label: '', street: '', city: '', state: '', pincode: '', landmark: '', isDefault: false });
    setIsAdding(false);
    setEditingIndex(null);
  };

  const handleEdit = (index: number) => {
    const address = customer?.addresses[index];
    if (address) {
      setFormData(address);
      setEditingIndex(index);
      setIsAdding(true);
    }
  };

  const handleDelete = async (index: number) => {
    try {
      const updatedUser = await api.deleteAddress(index);
      removeAddress(index);
      if (updatedUser.addresses && customer)
        setCustomer({ ...customer, addresses: updatedUser.addresses });
      toast({ title: 'Address removed' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove address. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const addresses = customer?.addresses || [];

  return (
    <div className="space-y-4">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)' }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '-60%',
            right: '-5%',
            width: 240,
            height: 240,
            background: 'radial-gradient(circle,rgba(212,152,64,0.22) 0%,transparent 65%)',
            filter: 'blur(28px)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
          }}
        />
        <div className="relative px-6 py-6 flex items-center justify-between">
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: '0.30em',
                textTransform: 'uppercase',
                color: 'rgba(212,152,64,0.55)',
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              Account
            </p>
            <h1 className="font-display text-xl font-bold" style={{ color: '#f5e8cc' }}>
              My Addresses
            </h1>
            <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(245,232,204,0.45)' }}>
              Manage your saved delivery locations
            </p>
          </div>
          {!isAdding && (
            <Button
              onClick={() => setIsAdding(true)}
              className="shrink-0 font-body text-sm"
              style={{
                background: 'rgba(212,152,64,0.18)',
                color: '#d49840',
                border: '1px solid rgba(212,152,64,0.30)',
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Address
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Add / Edit Form ─────────────────────────────────────── */}
      {isAdding && (
        <motion.div
          className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="px-6 py-4 border-b border-brand-border">
            <h2 className="font-display text-base font-semibold text-brand-charcoal">
              {editingIndex !== null ? 'Edit Address' : 'Add New Address'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">Label</label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Home, Office, etc."
                />
              </div>
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">
                  Pincode *
                </label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  placeholder="6-digit pincode"
                  maxLength={6}
                  className={cn(errors.pincode && 'border-brand-error')}
                />
                {errors.pincode ? (
                  <p className="text-xs text-brand-error mt-1">{errors.pincode}</p>
                ) : (
                  <p className="text-xs text-brand-muted mt-1">
                    Raipur, Bhilai, Durg &amp; Bilaspur (Chhattisgarh) only
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Street Address *
              </label>
              <Input
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                placeholder="House/Flat No., Building, Street"
                className={cn(errors.street && 'border-brand-error')}
              />
              {errors.street && (
                <p className="text-xs text-brand-error mt-1">{errors.street}</p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">City *</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                  className={cn(errors.city && 'border-brand-error')}
                />
                {errors.city && <p className="text-xs text-brand-error mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">State *</label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                  className={cn(errors.state && 'border-brand-error')}
                />
                {errors.state && <p className="text-xs text-brand-error mt-1">{errors.state}</p>}
              </div>
            </div>
            <div>
              <label className="font-body text-sm text-brand-text mb-1.5 block">
                Landmark (Optional)
              </label>
              <Input
                value={formData.landmark || ''}
                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                placeholder="Near..."
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 rounded border-brand-border text-brand-mustard focus:ring-brand-mustard"
              />
              <span className="font-body text-sm text-brand-text">Set as default address</span>
            </label>
            <div className="flex gap-3 pt-1">
              <Button
                type="submit"
                className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : editingIndex !== null ? (
                  'Save Changes'
                ) : (
                  'Add Address'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </motion.div>
      )}

      {/* ── Empty State ─────────────────────────────────────────── */}
      {addresses.length === 0 && !isAdding ? (
        <motion.div
          className="bg-white rounded-2xl p-12 shadow-brand-sm text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-sand flex items-center justify-center">
            <MapPin className="w-10 h-10 text-brand-muted" />
          </div>
          <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
            No addresses saved
          </h2>
          <p className="font-body text-brand-muted mb-6">Add an address for faster checkout.</p>
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Address
          </Button>
        </motion.div>
      ) : (
        /* ── Address Cards ──────────────────────────────────────── */
        <div className="grid sm:grid-cols-2 gap-4">
          {addresses.map((address, index) => (
            <motion.div
              key={index}
              className={cn(
                'bg-white rounded-2xl shadow-brand-sm overflow-hidden transition-all duration-200',
                address.isDefault
                  ? 'ring-2 ring-brand-mustard/35'
                  : 'border border-brand-border hover:border-brand-mustard/30'
              )}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              {/* Card header */}
              <div
                className="px-5 py-3.5 flex items-center justify-between border-b border-brand-border/60"
                style={
                  address.isDefault
                    ? {
                        background:
                          'linear-gradient(90deg,rgba(160,112,16,0.07) 0%,transparent 100%)',
                      }
                    : {}
                }
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: address.isDefault
                        ? 'rgba(212,152,64,0.15)'
                        : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <MapPin
                      className="w-3.5 h-3.5"
                      style={{ color: address.isDefault ? '#d49840' : 'hsl(var(--brand-muted))' }}
                    />
                  </div>
                  <span className="font-display font-semibold text-brand-charcoal text-sm">
                    {address.label}
                  </span>
                  {address.isDefault && (
                    <span
                      className="px-2 py-0.5 rounded-full font-body font-medium leading-none"
                      style={{
                        fontSize: 10,
                        background: 'rgba(212,152,64,0.12)',
                        color: '#b8821e',
                      }}
                    >
                      Default
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => handleEdit(index)}
                    className="p-1.5 text-brand-muted hover:text-brand-charcoal hover:bg-brand-sand rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="p-1.5 text-brand-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card body */}
              <div className="px-5 py-4">
                <div className="font-body text-sm text-brand-text space-y-0.5">
                  <p className="font-medium text-brand-charcoal">{address.street}</p>
                  {address.landmark && (
                    <p className="text-brand-muted text-xs">{address.landmark}</p>
                  )}
                  <p className="text-brand-muted">
                    {address.city}, {address.state} — {address.pincode}
                  </p>
                </div>
                {!address.isDefault && (
                  <button
                    onClick={() => setDefaultAddress(index)}
                    className="mt-3.5 font-body text-xs text-brand-mustard hover:text-brand-mustard-dark flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Set as default
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
