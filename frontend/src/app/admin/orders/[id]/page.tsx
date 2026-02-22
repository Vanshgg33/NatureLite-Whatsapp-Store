'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Truck, MessageSquare, Package, MapPin, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { OrderStatus, TrackingInfo } from '@/types';

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrderDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const orderId = params.id as string;

  const [newStatus, setNewStatus] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [note, setNote] = useState('');
  const [trackingData, setTrackingData] = useState<TrackingInfo | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
  });

  const statusMutation = useMutation({
    mutationFn: () => api.updateOrderStatus(orderId, {
      status: newStatus as OrderStatus,
      message: statusMessage || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      setNewStatus('');
      setStatusMessage('');
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => api.addOrderNote(orderId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      setNote('');
    },
  });

  const shipMutation = useMutation({
    mutationFn: () => api.createShipment(orderId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      toast({
        title: 'Shipment Created',
        description: data.awbNumber
          ? `AWB: ${data.awbNumber} via ${data.courierName || 'Shiprocket'}`
          : 'Shipment created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Shipment Failed',
        description: error.message || 'Could not create shipment. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleTrackShipment = async (awb: string) => {
    setIsTracking(true);
    try {
      const tracking = await api.trackShipment(awb);
      setTrackingData(tracking);
    } catch (error) {
      toast({
        title: 'Tracking Failed',
        description: 'Could not fetch tracking information.',
        variant: 'destructive',
      });
    } finally {
      setIsTracking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return <div>Order not found</div>;
  }

  const customer = typeof order.user === 'object' ? order.user : null;

  return (
    <div>
      <Header
        title={`Order ${order.orderNumber}`}
        description={formatDate(order.createdAt)}
        action={
          <Link href="/admin/orders">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
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
                  {order.timeline.map((entry, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="w-3 h-3 rounded-full bg-primary mt-1.5" />
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
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p><strong>AWB:</strong> {order.awbNumber}</p>
                    {order.courierName && <p><strong>Courier:</strong> {order.courierName}</p>}
                    {order.expectedDeliveryDate && (
                      <p><strong>Expected:</strong> {formatDate(order.expectedDeliveryDate)}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTrackShipment(order.awbNumber!)}
                      disabled={isTracking}
                    >
                      {isTracking ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      Track
                    </Button>
                    {order.trackingUrl && (
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          External Track
                        </Button>
                      </a>
                    )}
                  </div>

                  {trackingData && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge>{trackingData.status}</Badge>
                        {trackingData.currentLocation && (
                          <span className="text-sm text-muted-foreground">
                            @ {trackingData.currentLocation}
                          </span>
                        )}
                      </div>
                      {trackingData.estimatedDelivery && (
                        <p className="text-sm">
                          <strong>ETA:</strong> {trackingData.estimatedDelivery}
                        </p>
                      )}
                      {trackingData.activities && trackingData.activities.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          <p className="text-sm font-medium">Recent Activity:</p>
                          {trackingData.activities.slice(0, 5).map((activity, idx) => (
                            <div key={idx} className="text-xs text-muted-foreground pl-2 border-l-2">
                              <p>{activity.activity}</p>
                              <p className="text-[10px]">
                                {activity.date} {activity.location && `- ${activity.location}`}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Update Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Status message (optional)"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                />

                <Button
                  onClick={() => statusMutation.mutate()}
                  disabled={!newStatus || statusMutation.isPending}
                  className="w-full"
                >
                  {statusMutation.isPending ? 'Updating...' : 'Update Status'}
                </Button>
              </CardContent>
            </Card>

            {!order.awbNumber && order.status !== 'cancelled' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Create Shipment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shipMutation.isError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {(shipMutation.error as Error)?.message || 'Failed to create shipment'}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button
                    onClick={() => shipMutation.mutate()}
                    disabled={shipMutation.isPending || order.status === 'pending'}
                    className="w-full"
                  >
                    {shipMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating Shipment...
                      </>
                    ) : (
                      <>
                        <Truck className="h-4 w-4 mr-2" />
                        Ship with Shiprocket
                      </>
                    )}
                  </Button>
                  {order.status === 'pending' && (
                    <p className="text-xs text-muted-foreground text-center">
                      Confirm order before creating shipment
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Add Note
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Add internal note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={() => noteMutation.mutate()}
                  disabled={!note || noteMutation.isPending}
                  variant="outline"
                  className="w-full"
                >
                  {noteMutation.isPending ? 'Adding...' : 'Add Note'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
