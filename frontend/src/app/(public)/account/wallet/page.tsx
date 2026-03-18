'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CreditCard, ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { WalletBalance, WalletTransaction } from '@/types';

export default function WalletPage() {
  const { data: balance } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => api.getWallet(),
  });

  const { data: transactions = [], isLoading } = useQuery<WalletTransaction[]>({
    queryKey: ['wallet-transactions'],
    queryFn: () => api.getWalletTransactions(),
  });

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-mustard/10 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-brand-mustard" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-brand-charcoal">
              Wallet
            </h1>
            <p className="font-body text-sm text-brand-muted">
              Store credits you can use at checkout.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-body text-xs text-brand-muted mb-1">Available balance</p>
          <p className="font-display text-2xl font-bold text-brand-charcoal">
            {formatAmount(balance?.balance ?? 0)}
          </p>
        </div>
      </motion.div>

      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-brand-charcoal">
            Recent activity
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-brand-muted">
            <Clock className="w-3 h-3" />
            Last 10 transactions
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-brand-sand rounded-xl animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-brand-muted text-sm">
            No wallet activity yet. Refunds and manual credits will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-brand-border/60"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      tx.type === 'credit'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {tx.type === 'credit' ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-body text-sm text-brand-charcoal capitalize">
                      {tx.reason.replace(/_/g, ' ')}
                    </p>
                    <p className="font-body text-xs text-brand-muted">
                      {formatDateTime(tx.createdAt)}
                      {tx.orderId ? ` • Order #${tx.orderId.slice(-4)}` : ''}
                    </p>
                  </div>
                </div>
                <p
                  className={`font-display text-sm font-semibold ${
                    tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '-'}
                  {formatAmount(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

