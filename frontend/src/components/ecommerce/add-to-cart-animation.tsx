'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface FlyingItem {
  id: number;
  imageSrc: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface AddToCartAnimationContextType {
  triggerFlyAnimation: (imageSrc: string, startRect: DOMRect) => void;
}

const AddToCartAnimationContext = createContext<AddToCartAnimationContextType | null>(null);

export function useAddToCartAnimation() {
  return useContext(AddToCartAnimationContext);
}

let idCounter = 0;

export function AddToCartAnimationProvider({ children }: { children: ReactNode }) {
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);

  const triggerFlyAnimation = useCallback((imageSrc: string, startRect: DOMRect) => {
    const cartIcon = document.getElementById('cart-icon');
    if (!cartIcon) return;

    const cartRect = cartIcon.getBoundingClientRect();
    const newItem: FlyingItem = {
      id: ++idCounter,
      imageSrc,
      startX: startRect.left + startRect.width / 2,
      startY: startRect.top + startRect.height / 2,
      endX: cartRect.left + cartRect.width / 2,
      endY: cartRect.top + cartRect.height / 2,
    };

    setFlyingItems((prev) => [...prev, newItem]);
  }, []);

  const handleAnimationComplete = useCallback((id: number) => {
    setFlyingItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <AddToCartAnimationContext.Provider value={{ triggerFlyAnimation }}>
      {children}
      <AnimatePresence>
        {flyingItems.map((item) => (
          <FlyingImage
            key={item.id}
            item={item}
            onComplete={() => handleAnimationComplete(item.id)}
          />
        ))}
      </AnimatePresence>
    </AddToCartAnimationContext.Provider>
  );
}

function FlyingImage({ item, onComplete }: { item: FlyingItem; onComplete: () => void }) {
  const midX = (item.startX + item.endX) / 2;
  const midY = Math.min(item.startY, item.endY) - 80;

  return (
    <motion.div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: 0, top: 0 }}
      initial={{
        x: item.startX - 20,
        y: item.startY - 20,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        x: [item.startX - 20, midX - 20, item.endX - 20],
        y: [item.startY - 20, midY - 20, item.endY - 20],
        scale: [1, 0.8, 0.3],
        opacity: [1, 1, 0.5],
      }}
      transition={{
        duration: 0.65,
        ease: [0.22, 1, 0.36, 1],
        times: [0, 0.5, 1],
      }}
      onAnimationComplete={onComplete}
    >
      <div className="w-10 h-10 rounded-full overflow-hidden shadow-brand-lg bg-white">
        <Image
          src={item.imageSrc || '/images/placeholder-product.jpg'}
          alt=""
          width={40}
          height={40}
          className="object-cover w-full h-full"
        />
      </div>
    </motion.div>
  );
}
