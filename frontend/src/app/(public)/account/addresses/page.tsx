'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Edit2, Trash2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerStore, useDefaultAddress } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { Address } from '@/types';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export default function AddressesPage() {
  const { customer, addAddress, updateAddress, removeAddress, setDefaultAddress, setCustomer } = useCustomerStore();
  const defaultAddress = useDefaultAddress();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setIsSubmitting(true);

    const address: Address = {
      label: formData.label || 'Home',
      street: formData.street || '',
      city: formData.city || '',
      state: formData.state || '',
      pincode: formData.pincode || '',
      landmark: formData.landmark,
      isDefault: formData.isDefault || false,
    };

    try {
      if (editingIndex !== null) {
        // Update address via API
        const updatedUser = await api.updateAddress(editingIndex, address);
        // Update local store
        updateAddress(editingIndex, address);
        if (updatedUser.addresses && customer) {
          setCustomer({ ...customer, addresses: updatedUser.addresses });
        }
        toast({ title: 'Address updated' });
      } else {
        // Add address via API
        const updatedUser = await api.addAddress(address);
        // Update local store
        addAddress(address);
        if (updatedUser.addresses && customer) {
          setCustomer({ ...customer, addresses: updatedUser.addresses });
        }
        toast({ title: 'Address added' });
      }
      resetForm();
    } catch (error) {
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
    setFormData({
      label: '',
      street: '',
      city: '',
      state: '',
      pincode: '',
      landmark: '',
      isDefault: false,
    });
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
      if (updatedUser.addresses && customer) {
        setCustomer({ ...customer, addresses: updatedUser.addresses });
      }
      toast({ title: 'Address removed' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove address. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const addresses = customer?.addresses || [];

  return (
    <div className="space-y-6">
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-2xl font-bold text-brand-charcoal">
            My Addresses
          </h1>
          {!isAdding && (
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Address
            </Button>
          )}
        </div>
        <p className="font-body text-brand-muted">
          Manage your saved delivery addresses
        </p>
      </motion.div>

      {/* Add/Edit Form */}
      {isAdding && (
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-brand-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-4">
            {editingIndex !== null ? 'Edit Address' : 'Add New Address'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">
                  Label
                </label>
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
                  placeholder="302001"
                  required
                />
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
                required
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">
                  City *
                </label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                  required
                />
              </div>
              <div>
                <label className="font-body text-sm text-brand-text mb-1.5 block">
                  State *
                </label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                  required
                />
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 rounded border-brand-border text-brand-mustard focus:ring-brand-mustard"
              />
              <span className="font-body text-sm text-brand-text">
                Set as default address
              </span>
            </label>
            <div className="flex gap-3">
              <Button
                type="submit"
                className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingIndex !== null ? 'Save Changes' : 'Add Address'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Address List */}
      {addresses.length === 0 && !isAdding ? (
        <motion.div
          className="bg-white rounded-2xl p-12 shadow-brand-sm text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-sand flex items-center justify-center">
            <MapPin className="w-10 h-10 text-brand-muted" />
          </div>
          <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
            No addresses saved
          </h2>
          <p className="font-body text-brand-muted mb-6">
            Add an address for faster checkout.
          </p>
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Address
          </Button>
        </motion.div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {addresses.map((address, index) => (
            <motion.div
              key={index}
              className={cn(
                'bg-white rounded-2xl p-6 shadow-brand-sm border-2',
                address.isDefault ? 'border-brand-mustard' : 'border-transparent'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-brand-charcoal">
                    {address.label}
                  </span>
                  {address.isDefault && (
                    <span className="px-2 py-0.5 bg-brand-mustard/10 text-brand-mustard text-xs font-body rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(index)}
                    className="p-2 text-brand-muted hover:text-brand-charcoal transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="p-2 text-brand-muted hover:text-brand-error transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="font-body text-sm text-brand-text space-y-1">
                <p>{address.street}</p>
                {address.landmark && <p className="text-brand-muted">{address.landmark}</p>}
                <p>
                  {address.city}, {address.state} - {address.pincode}
                </p>
              </div>
              {!address.isDefault && (
                <button
                  onClick={() => setDefaultAddress(index)}
                  className="mt-4 font-body text-sm text-brand-mustard hover:underline flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  Set as default
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
