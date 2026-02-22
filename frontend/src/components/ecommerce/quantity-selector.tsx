'use client';

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'md',
  disabled = false,
}: QuantitySelectorProps) {
  const decrease = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const increase = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  const sizeClasses = {
    sm: {
      button: 'w-7 h-7',
      icon: 'w-3 h-3',
      value: 'w-8 text-sm',
    },
    md: {
      button: 'w-9 h-9',
      icon: 'w-4 h-4',
      value: 'w-12 text-base',
    },
    lg: {
      button: 'w-11 h-11',
      icon: 'w-5 h-5',
      value: 'w-14 text-lg',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="inline-flex items-center rounded-xl border border-brand-border bg-white">
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || value <= min}
        className={cn(
          classes.button,
          'flex items-center justify-center rounded-l-xl transition-colors',
          'hover:bg-brand-sand disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        aria-label="Decrease quantity"
      >
        <Minus className={cn(classes.icon, 'text-brand-text')} />
      </button>

      <div
        className={cn(
          classes.value,
          'flex items-center justify-center font-body font-medium text-brand-charcoal border-x border-brand-border'
        )}
      >
        {value}
      </div>

      <button
        type="button"
        onClick={increase}
        disabled={disabled || value >= max}
        className={cn(
          classes.button,
          'flex items-center justify-center rounded-r-xl transition-colors',
          'hover:bg-brand-sand disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        aria-label="Increase quantity"
      >
        <Plus className={cn(classes.icon, 'text-brand-text')} />
      </button>
    </div>
  );
}
