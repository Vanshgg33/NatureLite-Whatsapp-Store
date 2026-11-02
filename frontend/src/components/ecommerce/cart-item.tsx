'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { QuantitySelector } from './quantity-selector';
import { useCartStore, CartItem as CartItemType } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

interface CartItemProps {
  item: CartItemType;
  variant?: 'default' | 'compact';
}

export function CartItem({ item, variant = 'default' }: CartItemProps) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem    = useCartStore((state) => state.removeItem);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

  const handleQuantityChange = (q: number) => updateQuantity(item.productId, q, item.variantSku);
  const handleRemove         = () => removeItem(item.productId, item.variantSku);
  const nameInitial          = (item.name || '?').charAt(0).toUpperCase();

  /* ─── Compact (checkout sidebar) ─────────────────────────────────────── */
  if (variant === 'compact') {
    return (
      <div className="flex gap-3 py-3 border-b border-brand-border last:border-0">
        <Link
          href={`/products/${item.slug}`}
          className="relative w-16 h-16 rounded-lg overflow-hidden bg-brand-sand flex-shrink-0"
        >
          {item.image ? (
            <div className="absolute inset-[6%]">
              <Image src={item.image} alt={item.name} fill className="object-contain" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-display text-xl text-brand-brown/20">{nameInitial}</span>
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            href={`/products/${item.slug}`}
            className="font-display text-sm font-medium text-brand-charcoal hover:text-brand-brown line-clamp-1"
          >
            {item.name}
          </Link>
          <p className="font-body text-xs text-brand-muted mt-0.5">Qty: {item.quantity}</p>
          <p className="font-body text-sm font-medium text-brand-charcoal mt-1">
            {formatPrice(item.price * item.quantity)}
          </p>
        </div>
      </div>
    );
  }

  /* ─── Default (cart page) ─────────────────────────────────────────────── */
  return (
    <div
      className="group relative flex gap-4 sm:gap-5 py-5 border-b last:border-0 transition-colors duration-200"
      style={{ borderColor: 'rgba(160,112,16,0.10)' }}
    >
      {/* Image */}
      <Link
        href={`/products/${item.slug}`}
        className="relative flex-shrink-0 overflow-hidden rounded-2xl"
        style={{ width: 104, height: 104, background: '#f7f3eb' }}
      >
        {item.image ? (
          <div className="absolute inset-[7%] transition-transform duration-500 group-hover:scale-[1.06]">
            <Image src={item.image} alt={item.name} fill className="object-contain" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-3xl" style={{ color: 'rgba(160,112,16,0.18)' }}>
              {nameInitial}
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Name + remove */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/products/${item.slug}`}
              className={cn(
                'font-display font-semibold leading-snug line-clamp-2',
                'transition-colors duration-200 hover:text-brand-mustard'
              )}
              style={{ fontSize: 15, color: '#0b1c08' }}
            >
              {item.name}
            </Link>
            {item.variantName && (
              <span
                className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide"
                style={{ background: 'rgba(160,112,16,0.10)', color: '#6b4400' }}
              >
                {item.variantName}
              </span>
            )}
          </div>
          <button
            onClick={handleRemove}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center opacity-30 hover:opacity-100 transition-all duration-150 cursor-pointer"
            style={{ color: 'rgba(46,66,37,0.60)' }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.color = '#b91c1c';
              el.style.background = 'rgba(185,28,28,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.color = 'rgba(46,66,37,0.60)';
              el.style.background = 'transparent';
            }}
            aria-label="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Unit price */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-display font-bold" style={{ fontSize: 16, color: '#a07010' }}>
            {formatPrice(item.price)}
          </span>
          {item.compareAtPrice && item.compareAtPrice > item.price && (
            <span className="font-body text-xs line-through" style={{ color: 'rgba(46,66,37,0.30)' }}>
              {formatPrice(item.compareAtPrice)}
            </span>
          )}
        </div>

        {/* Qty + line total */}
        <div className="flex items-center justify-between mt-auto pt-3">
          <QuantitySelector
            value={item.quantity}
            onChange={handleQuantityChange}
            min={1}
            max={10}
            size="sm"
          />
          <div className="text-right">
            <p
              className="font-body uppercase tracking-[0.12em] mb-0.5"
              style={{ fontSize: 10, color: 'rgba(46,66,37,0.38)' }}
            >
              Total
            </p>
            <p className="font-display font-bold" style={{ fontSize: 17, color: '#0b1c08' }}>
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
