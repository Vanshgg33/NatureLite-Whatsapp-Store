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
    <div className="space-y-4">

      {/* ── Hero: title + balance ────────────────────────────────── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)' }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Glow orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '-60%',
            right: '-5%',
            width: 240,
            height: 240,
            background: 'radial-gradient(circle,rgba(212,152,64,0.22) 0%,transparent 65%)',
            filter: 'blur(28px)',
          }}
        />
        {/* Grain */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
          }}
        />

        <div className="relative px-6 py-6 flex items-center justify-between gap-4">
          {/* Left: title */}
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: '0.30em',
                textTransform: 'uppercase',
                color: 'rgba(212,152,64,0.55)',
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              Account
            </p>
            <h1 className="font-display text-xl font-bold" style={{ color: '#f5e8cc' }}>
              My Wallet
            </h1>
            <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(245,232,204,0.45)' }}>
              Store credits &amp; refunds
            </p>
          </div>

          {/* Right: balance */}
          <div className="text-right shrink-0">
            <p
              style={{
                fontSize: 10,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: 'rgba(212,152,64,0.55)',
                fontFamily: 'monospace',
                marginBottom: 6,
              }}
            >
              Available
            </p>
            <p
              className="font-display font-bold leading-none"
              style={{ color: '#f5e8cc', fontSize: '2rem' }}
            >
              {formatAmount(balance?.balance ?? 0)}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Transaction History ──────────────────────────────────── */}
      <motion.div
        className="bg-white rounded-2xl shadow-brand-sm overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-mustard/10 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-brand-mustard" />
            </div>
            <span className="font-display text-sm font-semibold text-brand-charcoal">
              Transaction History
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 font-body text-xs text-brand-muted">
            <Clock className="w-3 h-3" />
            Last 10
          </span>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[62px] bg-brand-sand/60 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-sand flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-brand-muted" />
              </div>
              <p className="font-body text-sm text-brand-muted">
                No wallet activity yet.
              </p>
              <p className="font-body text-xs text-brand-muted/70 mt-1">
                Refunds and manual credits will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-brand-border/60 hover:bg-brand-sand/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
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
                      <p className="font-body text-sm font-medium text-brand-charcoal capitalize">
                        {tx.reason.replace(/_/g, ' ')}
                      </p>
                      <p className="font-body text-xs text-brand-muted mt-0.5">
                        {formatDateTime(tx.createdAt)}
                        {tx.orderId ? ` · Order #${tx.orderId.slice(-4)}` : ''}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`font-display text-sm font-semibold shrink-0 ml-4 ${
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
        </div>
      </motion.div>
    </div>
  );
}
