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
  const removeItem = useCartStore((state) => state.removeItem);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleQuantityChange = (newQuantity: number) => {
    updateQuantity(item.productId, newQuantity, item.variantSku);
  };

  const handleRemove = () => {
    removeItem(item.productId, item.variantSku);
  };

  const nameInitial = (item.name || '?').charAt(0).toUpperCase();

  if (variant === 'compact') {
    return (
      <div className="flex gap-3 py-3 border-b border-brand-border last:border-0">
        <Link
          href={`/products/${item.slug}`}
          className="relative w-16 h-16 rounded-lg overflow-hidden bg-brand-sand flex-shrink-0"
        >
          {item.image ? (
            <Image
              src={item.image}
              alt={item.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-display text-xl text-brand-brown/20">
                {nameInitial}
              </span>
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
          <p className="font-body text-xs text-brand-muted mt-0.5">
            Qty: {item.quantity}
          </p>
          <p className="font-body text-sm font-medium text-brand-charcoal mt-1">
            {formatPrice(item.price * item.quantity)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 sm:gap-6 py-6 border-b border-brand-border last:border-0">
      {/* Image */}
      <Link
        href={`/products/${item.slug}`}
        className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-brand-sand flex-shrink-0"
      >
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-3xl text-brand-brown/20">
              {nameInitial}
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-4">
          <div>
            <Link
              href={`/products/${item.slug}`}
              className="font-display text-lg font-semibold text-brand-charcoal hover:text-brand-brown transition-colors line-clamp-1"
            >
              {item.name}
            </Link>
            {item.variantName && (
              <p className="font-body text-sm text-brand-muted mt-0.5">
                {item.variantName}
              </p>
            )}
          </div>
          <button
            onClick={handleRemove}
            className="p-2 text-brand-muted hover:text-brand-error transition-colors"
            aria-label="Remove item"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Price */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-display text-lg font-bold text-brand-charcoal">
            {formatPrice(item.price)}
          </span>
          {item.compareAtPrice && (
            <span className="font-body text-sm text-brand-muted line-through">
              {formatPrice(item.compareAtPrice)}
            </span>
          )}
        </div>

        {/* Quantity and Total */}
        <div className="flex items-center justify-between mt-4">
          <QuantitySelector
            value={item.quantity}
            onChange={handleQuantityChange}
            min={1}
            max={10}
          />
          <div className="text-right">
            <p className="font-body text-xs text-brand-muted">Total</p>
            <p className="font-display text-lg font-bold text-brand-charcoal">
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
