'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Truck, ExternalLink, CreditCard, Phone, Mail, MapPin, Clock, User } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { formatCurrency, formatDate } from '@/lib/utils';

const backHrefByDepartment: Record<string, string> = {
  packing: '/department/packing',
  billing: '/department/billing',
  delivery: '/department/delivery',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  placed:           { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  confirmed:        { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  preparing:        { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400'  },
  out_for_delivery: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  delivered:        { bg: 'bg-green-50',   text: 'text-green-700',   dot: 'bg-green-500'   },
  cancelled:        { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-400'     },
};

const PAYMENT_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  paid:    { bg: 'bg-green-50',  text: 'text-green-700'  },
  failed:  { bg: 'bg-red-50',    text: 'text-red-700'    },
};

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

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
      <div className="flex items-center justify-center h-screen bg-[#F9F6F0]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-[#D4A017] border-t-transparent animate-spin" />
          <p className="text-sm font-body text-brand-muted">Loading order…</p>
        </div>
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
  const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.placed;
  const paymentStyle = PAYMENT_STYLES[order.paymentStatus] ?? PAYMENT_STYLES.pending;

  return (
    <div className="min-h-screen bg-[#F9F6F0]">
      <Header
        title={`Order ${order.orderNumber}`}
        description={formatDate(order.createdAt)}
        action={
          <Link href={backHref}>
            <Button variant="outline" className="rounded-full border-gray-200 hover:bg-white gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
        }
      />

      {/* Hero strip */}
      <div className="bg-gradient-to-r from-[#1C1814] via-[#2C2118] to-[#3D2E20] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[#D4A017]/60 font-body text-[10px] tracking-widest uppercase mb-1">Order</p>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">{order.orderNumber}</h1>
            <p className="text-white/40 font-body text-sm mt-1">{formatDate(order.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
              {order.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${paymentStyle.bg} ${paymentStyle.text}`}>
              <CreditCard className="h-3.5 w-3.5" />
              {order.paymentStatus}
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/70">
              {order.paymentMethod.toUpperCase()}
            </span>
            {order.source && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white/70 capitalize">
                Source: {order.source}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Order Items */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#D4A017]/10 flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-[#D4A017]" />
                </div>
                <h2 className="font-display font-semibold text-brand-charcoal">Order Items</h2>
                <span className="ml-auto text-xs font-body text-brand-muted bg-gray-100 rounded-full px-2 py-0.5">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="divide-y divide-gray-50">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        width={56}
                        height={56}
                        className="rounded-xl object-cover border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-[#F9F6F0] rounded-xl border border-gray-100 flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-brand-charcoal text-sm leading-snug">{item.name}</p>
                      {item.variantName && (
                        <p className="text-xs text-brand-muted mt-0.5">{item.variantName}</p>
                      )}
                      <p className="text-xs text-brand-muted mt-0.5">
                        {formatCurrency(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-brand-charcoal">{formatCurrency(item.total)}</p>
                      {item.gstAmount > 0 && (
                        <p className="text-xs text-brand-muted mt-0.5">+GST {formatCurrency(item.gstAmount)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 space-y-2.5">
                <div className="flex justify-between text-sm font-body">
                  <span className="text-brand-muted">Subtotal</span>
                  <span className="text-brand-charcoal">{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-body">
                    <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
                    <span>−{formatCurrency(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-body">
                  <span className="text-brand-muted">Shipping</span>
                  <span className="text-brand-charcoal">
                    {order.shippingCharge > 0 ? formatCurrency(order.shippingCharge) : 'Free'}
                  </span>
                </div>
                {order.gstTotal > 0 && (
                  <div className="flex justify-between text-sm font-body">
                    <span className="text-brand-muted">GST</span>
                    <span className="text-brand-charcoal">{formatCurrency(order.gstTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 mt-1 border-t border-gray-200">
                  <span className="font-display font-bold text-brand-charcoal">Total</span>
                  <span className="font-display font-bold text-[#D4A017] text-xl">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </div>

            {/* Order Timeline */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-emerald-600" />
                </div>
                <h2 className="font-display font-semibold text-brand-charcoal">Order Timeline</h2>
              </div>

              <div className="px-6 py-5">
                <div className="relative">
                  {order.timeline && order.timeline.length > 1 && (
                    <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-100" />
                  )}
                  <div className="space-y-5">
                    {order.timeline?.map((entry: { message: string; timestamp: string; updatedBy?: string }, index: number) => (
                      <div key={index} className="flex gap-4 relative">
                        <div
                          className={`w-[15px] h-[15px] rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                            index === 0
                              ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_0_3px_#d1fae5]'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                        <div className="flex-1 pb-0.5">
                          <p className="font-medium text-brand-charcoal text-sm">{entry.message}</p>
                          <p className="text-xs text-brand-muted mt-0.5">{formatDate(entry.timestamp)}</p>
                          {entry.updatedBy && (
                            <p className="text-xs text-brand-muted/60 mt-0.5">by {entry.updatedBy}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Notes */}
            {order.adminNotes && (
              <div className="bg-amber-50 border border-amber-200/70 rounded-2xl px-6 py-5">
                <p className="text-[10px] font-display font-semibold text-amber-600 uppercase tracking-widest mb-2">
                  Admin Notes
                </p>
                <pre className="text-sm font-body text-amber-900 whitespace-pre-wrap leading-relaxed">
                  {order.adminNotes}
                </pre>
              </div>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="space-y-4">

            {/* Customer */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <h2 className="font-display font-semibold text-brand-charcoal text-sm">Customer</h2>
              </div>
              {customer && (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3.5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4A017] to-[#B8860B] flex items-center justify-center text-white font-display font-bold text-sm shrink-0 shadow-sm">
                      {getInitials(customer.name || 'U')}
                    </div>
                    <p className="font-semibold text-brand-charcoal text-sm leading-tight">{customer.name || 'Unnamed'}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-brand-muted font-body">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      {customer.phone}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2 text-sm text-brand-muted font-body">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <h2 className="font-display font-semibold text-brand-charcoal text-sm">Shipping Address</h2>
              </div>
              <div className="px-5 py-4 space-y-2">
                <p className="font-semibold text-brand-charcoal text-sm">{order.shippingAddress.name}</p>
                <div className="flex items-center gap-2 text-sm text-brand-muted font-body">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {order.shippingAddress.phone}
                  {order.shippingAddress.alternatePhone && ` / ${order.shippingAddress.alternatePhone}`}
                </div>
                <p className="text-sm text-brand-muted font-body leading-relaxed pt-0.5">
                  {order.shippingAddress.street},<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state}<br />
                  {order.shippingAddress.pincode}
                </p>
                {order.shippingAddress.landmark && (
                  <p className="text-xs text-brand-muted/70 italic font-body">
                    Near: {order.shippingAddress.landmark}
                  </p>
                )}
              </div>
            </div>

            {/* Shipping Details */}
            {order.awbNumber && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-sky-50 flex items-center justify-center shrink-0">
                    <Truck className="h-3.5 w-3.5 text-sky-600" />
                  </div>
                  <h2 className="font-display font-semibold text-brand-charcoal text-sm">Shipping</h2>
                </div>
                <div className="px-5 py-4 space-y-2.5 text-sm font-body">
                  <div className="flex justify-between">
                    <span className="text-brand-muted">AWB</span>
                    <span className="text-brand-charcoal font-medium">{order.awbNumber}</span>
                  </div>
                  {order.courierName && (
                    <div className="flex justify-between">
                      <span className="text-brand-muted">Courier</span>
                      <span className="text-brand-charcoal">{order.courierName}</span>
                    </div>
                  )}
                  {order.expectedDeliveryDate && (
                    <div className="flex justify-between">
                      <span className="text-brand-muted">Expected</span>
                      <span className="text-brand-charcoal">{formatDate(order.expectedDeliveryDate)}</span>
                    </div>
                  )}
                  {order.trackingUrl && (
                    <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="block pt-1">
                      <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Track Order
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
