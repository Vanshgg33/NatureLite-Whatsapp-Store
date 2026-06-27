'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, FileText, Camera, Banknote } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => api.getOrder(orderId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Order not found.</p>
        <Link href="/admin/orders">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const shipping = order.shippingAddress;

  return (
    <div>
      <Header
        title={`Order ${order.orderNumber}`}
        description={formatDate(order.createdAt)}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(`/invoice/${orderId}`, '_blank')}
            >
              <FileText className="mr-2 h-4 w-4" /> Generate GST Invoice
            </Button>
            <Link href="/admin/orders">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Badge className={getStatusColor(order.status)}>
            {order.status.toUpperCase()}
          </Badge>
          <Badge className={getStatusColor(order.paymentStatus)}>
            Payment: {order.paymentStatus}
          </Badge>
          <Badge variant="outline">{order.paymentMethod.toUpperCase()}</Badge>
          {order.source && (
            <Badge variant="secondary" className="capitalize">
              Source: {order.source}
            </Badge>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-[2fr,1.5fr]">
          <Card>
            <CardHeader>
              <CardTitle>Customer &amp; Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{shipping.name}</p>
                <p className="text-muted-foreground text-xs">{shipping.phone}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>{shipping.street}</p>
                <p>
                  {shipping.city}, {shipping.state} - {shipping.pincode}
                </p>
                {shipping.landmark && <p>Landmark: {shipping.landmark}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Discount{order.couponCode ? ` (${order.couponCode})` : ''}
                  </span>
                  <span className="text-red-600">- {formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span>{formatCurrency(order.gstTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatCurrency(order.shippingCharge)}</span>
              </div>
              <div className="border-t pt-2 mt-1 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <span className="truncate">
                  {item.name} {item.variantName ? `(${item.variantName})` : ''} × {item.quantity}
                </span>
                <span>{formatCurrency(item.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* UPI payment proof */}
        {order.paymentProofUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-blue-600" />
                UPI Payment Screenshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.paymentProofUrl}
                  alt="UPI payment proof"
                  className="max-h-80 w-auto rounded-lg border object-contain hover:opacity-90 transition-opacity cursor-zoom-in"
                />
              </a>
            </CardContent>
          </Card>
        )}

        {/* Delivery proof — shown only after delivery is completed */}
        {(order.deliveryProofUrl || order.amountCollected !== undefined) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-green-600" />
                Delivery Confirmation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.amountCollected !== undefined && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                  <Banknote className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Amount collected by delivery</p>
                    <p className="text-lg font-bold text-green-700">{formatCurrency(order.amountCollected)}</p>
                    {order.amountCollected !== order.total && (
                      <p className={`text-xs font-medium mt-0.5 ${order.amountCollected < order.total ? 'text-red-500' : 'text-amber-600'}`}>
                        {order.amountCollected < order.total
                          ? `Short by ${formatCurrency(order.total - order.amountCollected)}`
                          : `Excess ${formatCurrency(order.amountCollected - order.total)}`}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {order.deliveryProofUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600">Delivery proof</p>
                  <a href={order.deliveryProofUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.deliveryProofUrl}
                      alt="Delivery proof"
                      className="w-full rounded-lg border object-cover aspect-[4/3] hover:opacity-90 transition-opacity cursor-zoom-in"
                    />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

