'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ShortPayLinkPage() {
  const params = useParams();
  const router = useRouter();
  const code = typeof params.code === 'string' ? params.code : '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('Invalid payment link.');
      return;
    }
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
    fetch(`${apiUrl}/payments/p/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Payment link not found or expired.');
        return res.json() as Promise<{ orderId: string; token: string }>;
      })
      .then(({ orderId, token }) => {
        router.replace(`/pay/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`);
      })
      .catch((err: Error) => {
        setError(err.message ?? 'Payment link expired or invalid.');
      });
  }, [code, router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="font-semibold text-gray-800">{error}</p>
        <p className="text-sm text-gray-500">
          Reply <strong>pay</strong> on WhatsApp to get a fresh payment link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center">
      <p className="text-gray-500 animate-pulse">Opening payment page…</p>
    </div>
  );
}
