'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Truck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';

const backHrefByDepartment: Record<string, string> = {
  packing: '/department/packing',
  billing: '/department/billing',
  delivery: '/department/delivery',
};

export default function DepartmentOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { user } = useAdminAuthStore();

  const backHref = user?.departmentType ? backHrefByDepartment[user.departmentType] : '/department/billing';

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
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
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const customer = typeof order.user === 'object' ? order.user : null;

  return (
    <div>
      <Header
        title={`Order ${order.orderNumber}`}
        description={formatDate(order.createdAt)}
        action={
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Badge className={getStatusColor(order.status)} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
            {order.status.toUpperCase()}
          </Badge>
          <Badge className={getStatusColor(order.paymentStatus)}>
            Payment: {order.paymentStatus}
          </Badge>
          <Badge variant="outline">{order.paymentMethod.toUpperCase()}</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Order Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-4 pb-4 border-b last:border-0 last:pb-0">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={60}
                          height={60}
                          className="rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-[60px] h-[60px] bg-gray-100 rounded-lg" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        {item.variantName && (
                          <p className="text-sm text-muted-foreground">{item.variantName}</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(item.price)} x {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(item.total)}</p>
                        {item.gstAmount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            GST: {formatCurrency(item.gstAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
                      <span>-{formatCurrency(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{order.shippingCharge > 0 ? formatCurrency(order.shippingCharge) : 'Free'}</span>
                  </div>
                  {order.gstTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST</span>
                      <span>{formatCurrency(order.gstTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.timeline?.map((entry: { message: string; timestamp: string; updatedBy?: string }, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="w-3 h-3 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{entry.message}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(entry.timestamp)}</p>
                        {entry.updatedBy && (
                          <p className="text-xs text-muted-foreground">by {entry.updatedBy}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {order.adminNotes && (
              <Card>
                <CardHeader>
                  <CardTitle>Admin Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-sm whitespace-pre-wrap">{order.adminNotes}</pre>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <CardContent>
                {customer && (
                  <div className="space-y-2">
                    <p className="font-medium">{customer.name || 'Unnamed'}</p>
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                    {customer.email && (
                      <p className="text-sm text-muted-foreground">{customer.email}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <p className="font-medium">{order.shippingAddress.name}</p>
                  <p className="text-sm">{order.shippingAddress.phone}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.shippingAddress.street}
                    <br />
                    {order.shippingAddress.city}, {order.shippingAddress.state}
                    <br />
                    {order.shippingAddress.pincode}
                  </p>
                  {order.shippingAddress.landmark && (
                    <p className="text-sm text-muted-foreground">
                      Landmark: {order.shippingAddress.landmark}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {order.awbNumber && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Shipping Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><strong>AWB:</strong> {order.awbNumber}</p>
                  {order.courierName && <p><strong>Courier:</strong> {order.courierName}</p>}
                  {order.expectedDeliveryDate && (
                    <p><strong>Expected:</strong> {formatDate(order.expectedDeliveryDate)}</p>
                  )}
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="mt-2">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Track Order
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
