import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sum of main product stock + all variant stocks (for Product from API). */
export function getProductTotalStock(product: { stock?: number; variants?: { stock?: number }[] }): number {
  const main = product.stock ?? 0;
  const variantsSum = (product.variants ?? []).reduce((s, v) => s + (v.stock ?? 0), 0);
  return main + variantsSum;
}

/** Sum of main stock + all variant SKU stocks (for StoreStockItem). */
export function getStoreItemTotalStock(item: { stock?: number; variantStocks?: { stock?: number }[] }): number {
  const main = item.stock ?? 0;
  const variantsSum = (item.variantStocks ?? []).reduce((s, v) => s + (v.stock ?? 0), 0);
  return main + variantsSum;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function formatShortDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'short',
  }).format(new Date(date));
}

/** Label + badge key: preparing + packedAt shows as ready to dispatch (DB status unchanged). */
export function getCustomerOrderStatusDisplay(order: {
  status: string;
  packedAt?: string | Date | null;
}): { label: string; colorKey: string } {
  if (order.status === 'preparing' && order.packedAt) {
    return { label: 'Ready for delivery', colorKey: 'out_for_delivery' };
  }
  return { label: order.status.replace(/_/g, ' '), colorKey: order.status };
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    placed: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    preparing: 'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    returned: 'bg-orange-100 text-orange-800',
    refunded: 'bg-gray-100 text-gray-800',
    paid: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
