'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

const WHATSAPP_NUMBER = '918817200740';
const DEFAULT_CITY = 'Raipur';
const SERVICEABLE_PREFIXES = ['492', '490', '491', '495'];

interface OrderItem {
  productId: string;
  variantSku?: string;
  variantName?: string;
  name: string;
  quantity: number;
  price: number;
}

interface Props {
  items: OrderItem[];
  total: number;
  onClose: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export function WhatsAppOrderModal({ items, total, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(DEFAULT_CITY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    const cleanPincode = pincode.replace(/\D/g, '');
    if (cleanPincode.length !== 6) {
      setError('Enter a valid 6-digit pincode');
      return;
    }
    if (!SERVICEABLE_PREFIXES.some((p) => cleanPincode.startsWith(p))) {
      setError('Sorry, we currently deliver only to Raipur, Bhilai, Durg & Bilaspur (Chhattisgarh).');
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.createGuestOrder({
        items: items.map((it) => ({ productId: it.productId, variantSku: it.variantSku, quantity: it.quantity })),
        shippingAddress: {
          name,
          phone: cleanPhone,
          street: address,
          city,
          state: 'Chhattisgarh',
          pincode,
        },
        paymentMethod: 'cod',
        phone: cleanPhone,
        name,
      });

      const lines = items.map((it) => {
        const variant = it.variantName ? ` (${it.variantName})` : '';
        return `• ${it.name}${variant} × ${it.quantity} — ${fmt(it.price * it.quantity)}`;
      });

      const message = [
        `Hi! I'd like to confirm my order #${order.orderNumber}:`,
        '',
        ...lines,
        '',
        `*Total: ${fmt(total)}*`,
        '',
        `📦 Deliver to:`,
        `${name}`,
        `${address}, ${city} - ${pincode}`,
        `📞 ${cleanPhone}`,
      ].join('\n');

      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-lg font-semibold text-gray-900">Complete Your Order</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Order summary */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 space-y-1 max-h-32 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-700">
              <span className="truncate mr-2">
                {it.name}{it.variantName ? ` (${it.variantName})` : ''} ×{it.quantity}
              </span>
              <span className="shrink-0 font-medium">{fmt(it.price * it.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200 mt-1">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone *</label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode *</label>
              <input
                required
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="452001"
                maxLength={6}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Address *</label>
            <textarea
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House/Flat No., Street, Area..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 disabled:opacity-60"
            style={{ background: '#25D366', boxShadow: '0 4px 18px -4px rgba(37,211,102,0.40)' }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor"/>
                <path d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z" fill="currentColor"/>
              </svg>
            )}
            Place Order via WhatsApp
          </button>
        </form>
      </div>
    </div>
  );
}
