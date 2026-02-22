// ==================== USER TYPES ====================
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

// ==================== CATEGORY TYPES ====================
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

// ==================== PRODUCT TYPES ====================
export interface ProductVariantAttributes {
  size?: string;
  color?: string;
  weight?: string;
  volume?: string;
  [key: string]: string | undefined;
}

export interface ProductVariant {
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  attributes: ProductVariantAttributes;
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
  isNew?: boolean;
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

// ==================== ORDER TYPES ====================
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

// ==================== COUPON TYPES ====================
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

// ==================== ANALYTICS TYPES ====================
export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  monthOrders: number;
  monthRevenue: number;
  totalCustomers: number;
  pendingOrders: number;
  recentOrders: Order[];
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderAnalytics {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: { status: OrderStatus; count: number }[];
  ordersByPaymentMethod: { method: PaymentMethod; count: number }[];
}

export interface CustomerAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  topCustomers: { customer: User; totalSpent: number; orderCount: number }[];
}

export interface ProductAnalytics {
  totalProducts: number;
  topSelling: { product: Product; sold: number; revenue: number }[];
  lowStock: Product[];
  outOfStock: Product[];
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

// ==================== CHAT/WHATSAPP TYPES ====================
export interface ChatSessionContext {
  cartItems?: string[];
  selectedProduct?: string;
  searchQuery?: string;
  currentCategory?: string;
  step?: string;
  [key: string]: string | string[] | undefined;
}

export interface ChatSession {
  _id: string;
  sessionId: string;
  phone: string;
  user?: string;
  currentState: string;
  previousState?: string;
  context: ChatSessionContext;
  lastActivity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageContent {
  type: 'text' | 'image' | 'button' | 'list' | 'template';
  text?: string;
  imageUrl?: string;
  buttons?: { id: string; title: string }[];
  templateName?: string;
  [key: string]: string | { id: string; title: string }[] | undefined;
}

export interface MessageLog {
  _id: string;
  messageId: string;
  phone: string;
  direction: 'incoming' | 'outgoing';
  type: string;
  content: MessageContent;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  timestamp: string;
  createdAt: string;
}

// ==================== SETTINGS TYPES ====================
export interface StoreSettings {
  name: string;
  currency: string;
  description: string;
  minOrderAmount: number;
  freeShippingThreshold: number;
  defaultShippingCharge: number;
}

export interface WhatsAppSettings {
  welcomeMessage: string;
  abandonedCartReminderEnabled: boolean;
  abandonedCartReminderDelayMinutes: number;
}

export interface SettingsValue {
  store?: StoreSettings;
  whatsapp?: WhatsAppSettings;
  [key: string]: StoreSettings | WhatsAppSettings | undefined;
}

export interface Settings {
  _id: string;
  key: string;
  value: StoreSettings | WhatsAppSettings;
  isPublic: boolean;
  updatedAt: string;
}

// ==================== API RESPONSE TYPES ====================
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
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  role: 'admin' | 'superadmin' | 'customer';
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

// ==================== SHIPPING TYPES ====================
export interface ShippingRate {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDays: number;
  cod: boolean;
}

export interface ShipmentResponse {
  success: boolean;
  orderId?: string;
  shipmentId?: string;
  awbNumber?: string;
  courierName?: string;
  label?: string;
  error?: string;
}

export interface TrackingInfo {
  awbNumber: string;
  status: string;
  currentLocation?: string;
  estimatedDelivery?: string;
  activities: {
    date: string;
    activity: string;
    location?: string;
  }[];
}

// ==================== COUPON VALIDATION ====================
export interface CouponValidationResult {
  valid: boolean;
  discount?: number;
  discountType?: 'percentage' | 'fixed';
  message?: string;
}

// ==================== DTO TYPES ====================
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

// ==================== ORDER STATS ====================
export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
}

export interface OrdersByStatus {
  pending: number;
  confirmed: number;
  processing: number;
  shipped: number;
  out_for_delivery: number;
  delivered: number;
  cancelled: number;
  returned: number;
  refunded: number;
}

// ==================== CART TYPES ====================
export interface CartItem {
  product: Product | string;
  variantSku?: string;
  quantity: number;
  price: number;
  name: string;
  image?: string;
  addedAt: string;
}

export interface Cart {
  _id: string;
  user: string;
  items: CartItem[];
  couponCode?: string;
  discount: number;
  subtotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartResponse {
  id: string;
  items: CartItem[];
  couponCode?: string;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
}

// ==================== ORDER CREATION DTO ====================
export interface CreateOrderDto {
  items?: { productId: string; variantSku?: string; quantity: number }[];
  cartId?: string;
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
}

export interface ReorderDto {
  orderId: string;
  shippingAddress?: ShippingAddress;
}

// ==================== ADDRESS DTO ====================
export interface AddAddressDto {
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault?: boolean;
}

export interface UpdateAddressDto {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  isDefault?: boolean;
}

// ==================== CUSTOMER AUTH ====================
export interface CustomerLoginDto {
  phone: string;
  otp: string;
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
}
