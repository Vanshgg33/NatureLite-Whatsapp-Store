export interface User {
  _id: string;
  phone: string;
  name?: string;
  email?: string;
  addresses: Address[];
  isActive: boolean;
  isBlocked: boolean;
  blockedReason?: string;
  totalOrders: number;
  totalSpent: number;
  role?: 'admin' | 'superadmin' | 'customer';
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault: boolean;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  attributes: Record<string, string>;
  isActive: boolean;
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: Category | string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  sku: string;
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  variants: ProductVariant[];
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  weight?: number;
  dimensions?: ProductDimensions;
  gstPercentage: number;
  hsnCode?: string;
  totalSold: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  product: Product | string;
  name: string;
  variantSku?: string;
  variantName?: string;
  quantity: number;
  price: number;
  total: number;
  image?: string;
  gstAmount: number;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
}

export interface TimelineEntry {
  status: string;
  message: string;
  timestamp: string;
  updatedBy?: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'prepaid' | 'upi' | 'card' | 'netbanking' | 'wallet';

export interface Order {
  _id: string;
  orderNumber: string;
  user: User | string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  couponCode?: string;
  shippingCharge: number;
  gstTotal: number;
  total: number;
  notes?: string;
  adminNotes?: string;
  priorityTags: string[];
  timeline: TimelineEntry[];
  awbNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  expectedDeliveryDate?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  _id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount: number;
  maxUsageCount?: number;
  maxUsagePerUser?: number;
  usedCount: number;
  allowedUsers?: string[];
  allowedCategories?: string[];
  allowedProducts?: string[];
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  isFirstOrderOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  monthOrders: number;
  monthRevenue: number;
  totalCustomers: number;
  pendingOrders: number;
  recentOrders: Order[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    role: string;
  };
}

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ChatSession {
  _id: string;
  sessionId: string;
  phone: string;
  user?: string;
  currentState: string;
  previousState?: string;
  context: Record<string, unknown>;
  lastActivity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLog {
  _id: string;
  messageId: string;
  phone: string;
  direction: 'incoming' | 'outgoing';
  type: string;
  content: Record<string, unknown>;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  timestamp: string;
  createdAt: string;
}

export interface AnalyticsSnapshot {
  _id: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  date: string;
  metrics: {
    orders: number;
    revenue: number;
    newCustomers: number;
    messages: number;
  };
  createdAt: string;
}

export interface Settings {
  _id: string;
  key: string;
  value: Record<string, unknown>;
  isPublic: boolean;
  updatedAt: string;
}

// DTO types for creating/updating
export interface CreateProductDto {
  name: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  category: string;
  images?: string[];
  price: number;
  compareAtPrice?: number;
  sku: string;
  stock?: number;
  trackStock?: boolean;
  lowStockThreshold?: number;
  variants?: Omit<ProductVariant, 'isActive'>[];
  isActive?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  weight?: number;
  dimensions?: ProductDimensions;
  gstPercentage?: number;
  hsnCode?: string;
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  parent?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateCouponDto {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  maxUsageCount?: number;
  maxUsagePerUser?: number;
  allowedUsers?: string[];
  allowedCategories?: string[];
  allowedProducts?: string[];
  validFrom: string;
  validUntil: string;
  isActive?: boolean;
  isFirstOrderOnly?: boolean;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  message?: string;
  updatedBy?: string;
}

export interface UpdateShippingDto {
  awbNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  expectedDeliveryDate?: string;
}
