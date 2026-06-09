'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [dir, setDir] = useState<1 | -1>(1);

  const decrease = () => {
    if (value > min) { setDir(-1); onChange(value - 1); }
  };

  const increase = () => {
    if (value < max) { setDir(1); onChange(value + 1); }
  };

  const sizeClasses = {
    sm: { button: 'w-7 h-7',  icon: 'w-3 h-3', value: 'w-8  text-sm'  },
    md: { button: 'w-9 h-9',  icon: 'w-4 h-4', value: 'w-12 text-base' },
    lg: { button: 'w-11 h-11', icon: 'w-5 h-5', value: 'w-14 text-lg'  },
  };

  const classes = sizeClasses[size];

  return (
    <div className="inline-flex items-center rounded-xl border border-brand-border bg-white overflow-hidden">
      <motion.button
        type="button"
        onClick={decrease}
        disabled={disabled || value <= min}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        className={cn(
          classes.button,
          'flex items-center justify-center rounded-l-xl cursor-pointer',
          'hover:bg-brand-sand disabled:opacity-40 disabled:cursor-not-allowed'
        )}
        style={{ transition: 'background 0.1s' } as React.CSSProperties}
        aria-label="Decrease quantity"
      >
        <Minus className={cn(classes.icon, 'text-brand-text')} />
      </motion.button>

      <div
        className={cn(
          classes.value,
          'relative flex items-center justify-center font-body font-semibold text-brand-charcoal border-x border-brand-border overflow-hidden'
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: dir * -16, opacity: 0, scale: 0.7 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: dir * 16, opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 700, damping: 28 }}
            className="block"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.button
        type="button"
        onClick={increase}
        disabled={disabled || value >= max}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        className={cn(
          classes.button,
          'flex items-center justify-center rounded-r-xl cursor-pointer',
          'hover:bg-brand-sand disabled:opacity-40 disabled:cursor-not-allowed'
        )}
        style={{ transition: 'background 0.1s' } as React.CSSProperties}
        aria-label="Increase quantity"
      >
        <Plus className={cn(classes.icon, 'text-brand-text')} />
      </motion.button>
    </div>
  );
}
