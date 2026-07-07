'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function ShortPayLinkPage() {
  const params = useParams();
  const code = typeof params.code === 'string' ? params.code : '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('Invalid payment link.');
      return;
    }
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api/v1').replace(/\/$/, '');
    // Navigate the browser directly to the backend resolve endpoint.
    // The backend looks up Redis and issues a 302 to the full pay URL — token never passes through frontend JS.
    window.location.replace(`${apiUrl}/payments/p/${encodeURIComponent(code)}`);
  }, [code]);

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
