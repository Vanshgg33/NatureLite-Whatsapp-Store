'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import type { RazorpayCheckoutResponse } from '@/types';

export default function WhatsAppPayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const token = searchParams.get('t') ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');

  const runCheckout = useCallback(async () => {
    if (!orderId || !token) {
      setError('Invalid payment link. Open the link from your WhatsApp message again.');
      setLoading(false);
      return;
    }

    try {
      const data = await api.whatsappPrepareCheckout(orderId, token);

      setOrderNumber(data.orderNumber);

      if (data.alreadyPaid) {
        setAlreadyPaid(true);
        setLoading(false);
        return;
      }

      if (!data.keyId || !data.razorpayOrderId) {
        setError('Payment could not be started. Please try again or contact support.');
        setLoading(false);
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Store',
        description: `Order #${data.orderNumber}`,
        order_id: data.razorpayOrderId,
        handler: async (response: RazorpayCheckoutResponse) => {
          try {
            await api.whatsappVerifyPayment({
              payToken: token,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setAlreadyPaid(true);
          } catch {
            setError(
              'Payment verification failed. If money was debited, contact support with your order number.',
            );
          } finally {
            setLoading(false);
          }
        },
        theme: { color: '#D4A574' },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      };

      if (typeof window === 'undefined' || !window.Razorpay) {
        setError('Payment widget failed to load. Refresh the page or use another browser.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay(options);
      rzp.open();
      setLoading(false);
    } catch (e) {
      const msg = isAxiosError(e)
        ? String(e.response?.data?.message ?? '')
        : '';
      setError(msg || 'Could not start payment. The link may have expired.');
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    void runCheckout();
  }, [runCheckout]);

  return (
    <div className="min-h-screen pt-24 pb-16 bg-brand-cream">
      <div className="brand-container max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-brand-sm p-8 text-center space-y-4">
          <h1 className="font-display text-xl font-semibold text-brand-charcoal">
            Complete payment
          </h1>

          {loading && !error && !alreadyPaid && (
            <p className="font-body text-sm text-brand-muted">Opening secure checkout…</p>
          )}

          {error && (
            <>
              <p className="font-body text-sm text-red-600">{error}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => void runCheckout()}>
                Try again
              </Button>
            </>
          )}

          {alreadyPaid && (
            <>
              <p className="font-body text-brand-text">
                Payment received for order <strong>{orderNumber}</strong>. Thank you!
              </p>
              <Link href="/">
                <Button className="rounded-xl bg-brand-mustard hover:bg-brand-mustard-dark text-white">
                  Back to home
                </Button>
              </Link>
            </>
          )}

          {!loading && !error && !alreadyPaid && orderNumber && (
            <p className="font-body text-xs text-brand-muted">
              If the payment window did not open, tap Try again or return to WhatsApp.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
