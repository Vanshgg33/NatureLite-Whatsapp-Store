'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlistStore } from '@/lib/wishlist-store';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { useCustomerStore } from '@/lib/customer-store';
import { api } from '@/lib/api';

export default function WishlistPage() {
  const items = useWishlistStore((state) => state.items);
  const remove = useWishlistStore((state) => state.remove);
  const clear = useWishlistStore((state) => state.clear);
  const setItems = useWishlistStore((state) => state.setItems);
  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();
  const isAuthenticated = useCustomerStore((state) => state.isAuthenticated);

  // Sync server-side wishlist when customer is authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      try {
        const wishlist = await api.getWishlist();
        setItems(
          wishlist.items.map((item) => ({
            productId: item.productId,
            slug: item.slug,
            name: item.name,
            image: item.image,
            price: item.price,
          })),
        );
      } catch {
        // Fail silently and keep local wishlist for now
      }
    })();
  }, [isAuthenticated, setItems]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  const handleMoveToCart = (productId: string) => {
    const item = items.find((i) => i.productId === productId);
    if (!item) return;

    addItem(
      {
        productId: item.productId,
        name: item.name,
        slug: item.slug,
        image: item.image || '/images/products/placeholder.jpg',
        price: item.price,
        // Use default GST (5%) so moving from wishlist keeps tax consistent
        gstPercentage: 5,
      },
      1,
    );
    remove(productId);
    toast({
      title: 'Moved to cart',
        description: `${item.name} has been added to your cart.`,
    });
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-24">
          <motion.div
            className="max-w-md mx-auto text-center bg-white rounded-2xl p-8 shadow-brand-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-sand flex items-center justify-center">
              <Heart className="w-10 h-10 text-brand-muted" />
            </div>
            <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-3">
              Your wishlist is empty
            </h1>
            <p className="font-body text-brand-muted mb-6">
              Save products you love and come back to them anytime.
            </p>
            <Link href="/products">
              <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-full px-8">
                Browse Products
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-brand-charcoal">My Wishlist</h1>
            <p className="font-body text-brand-muted mt-1">
              {items.length} item{items.length === 1 ? '' : 's'} saved for later
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clear}>
            Clear wishlist
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => (
            <motion.div
              key={item.productId}
              className="bg-white rounded-2xl shadow-brand-sm overflow-hidden flex flex-col"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link href={`/products/${item.slug}`} className="relative block aspect-square bg-brand-sand">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-mustard/20 to-brand-brown/20">
                    <span className="font-display text-6xl text-brand-brown/20">
                      {(item.name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </Link>
              <div className="p-5 flex-1 flex flex-col">
                <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-1 line-clamp-1">
                  {item.name}
                </h2>
                <p className="font-body text-brand-muted mb-4">{formatPrice(item.price)}</p>
                <div className="mt-auto flex items-center gap-2">
                  <Button
                    className="flex-1 bg-brand-charcoal hover:bg-brand-brown text-white rounded-xl"
                    onClick={() => handleMoveToCart(item.productId)}
                  >
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    Move to Cart
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl"
                    onClick={() => remove(item.productId)}
                    aria-label="Remove from wishlist"
                  >
                    <Heart className="w-4 h-4 text-brand-terracotta" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

