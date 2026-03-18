'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export function AccountLoginRequired() {
  return (
    <motion.div
      className="bg-white rounded-2xl p-8 shadow-brand-sm text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
        Login to access your account
      </h2>
      <p className="font-body text-brand-muted mb-6">
        Sign in to view your orders, manage addresses, and update account settings.
      </p>
      <Link href="/login">
        <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-full px-8">
          Go to Login
        </Button>
      </Link>
    </motion.div>
  );
}

