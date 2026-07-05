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

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'superadmin';
  isActive: boolean;
  store?: string;
  departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
  permissions: string[];
  plainPassword?: string;
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
  gstPercentage?: number;
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
  images?: string[];
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
}

export interface NutritionalFactRow {
  name: string;
  per100g: string;
  perServing: string;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: Category | string;
  images: string[];
  imageAlts?: string[];
  videoUrl?: string;
  videos?: string[];
  price: number;
  compareAtPrice?: number;
  specialOfferPrice?: number;
  specialOfferLabel?: string;
  specialOfferActive?: boolean;
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
  gstPercentage?: number;
  hsnCode?: string;
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
    canonicalUrl?: string;
  };
  nutritionalFacts?: {
    isActive: boolean;
    rows: NutritionalFactRow[];
  };
  ingredients?: {
    isActive: boolean;
    text: string;
  };
  allergenDeclaration?: {
    isActive: boolean;
    text: string;
  };
  relatedProducts?: (string | { _id: string; name: string })[];
  upsellProducts?: (string | { _id: string; name: string })[];
  totalSold: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  batchInfo?: {
    batchNumber?: string;
    batchDate?: string;
    yieldKg?: number;
    milkLitres?: number;
    origin?: string;
    nextBatchDays?: number;
    purityClaims?: string[];
  };
  labReportUrl?: string;
}

// ==================== ORDER TYPES ====================
export interface EditChange {
  type: 'qty_changed' | 'item_added' | 'item_removed';
  productId: string;
  name: string;
  variantSku?: string;
  variantName?: string;
  oldQty?: number;
  newQty?: number;
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
  alternatePhone?: string;
  street: string;
  city: string;
  state: string;
  pincode?: string;
  landmark?: string;
}

export interface TimelineEntry {
  status: string;
  message: string;
  timestamp: string;
  updatedBy?: string;
}

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded';

/**
 * Pending fulfilment bucket (analytics / chatbot hints).
 * Prefer generating this from the backend OpenAPI schema or a shared package so it cannot drift.
 */
export const ORDER_STATUSES_PENDING_FULFILLMENT: readonly OrderStatus[] = [
  'placed',
  'confirmed',
  'preparing',
] as const;

export function isOrderStatusPendingFulfillment(status: string): boolean {
  return (ORDER_STATUSES_PENDING_FULFILLMENT as readonly string[]).includes(status);
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cod' | 'prepaid' | 'upi' | 'card' | 'netbanking' | 'wallet';

export interface Order {
  _id: string;
  orderNumber: string;
  user: User | string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  source?: string;
  orderType?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  couponCode?: string;
  // Wallet + gateway breakdown (amounts are stored in paise on the backend;
  // divide by 100 before displaying as rupees).
  walletUsed?: number;
  paymentGatewayAmount?: number;
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
  packedAt?: string;
  packedBy?: string;
  packedByName?: string;
  billedAt?: string;
  billedBy?: string;
  outForDeliveryAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  returnRequestedAt?: string;
  returnRequestReason?: string;
  returnRequestStatus?: 'requested' | 'approved' | 'rejected' | 'completed';
  deliveryProofUrl?: string;
  paymentProofUrl?: string;
  amountCollected?: number;
  collectionStatus?: 'pending' | 'settled';
  settledAt?: string;
  settledBy?: string;
  assignedDeliveryUserId?: string;
  invoiceUrl?: string;
  scheduledFor?: string;
  repackRequired?: boolean;
  editChanges?: EditChange[];
  metadata?: {
    deliveryWorkflow?: {
      status?: string;
      paymentMethod?: 'cash' | 'upi';
      amountCollected?: number;
      cashAmount?: number;
      upiAmount?: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLedgerRow {
  deliveryUserId: string;
  name: string;
  email?: string;
  totalOrders: number;
  totalCashCollected: number;
  totalUpiCollected: number;
  pendingCashInPeriod: number;
  totalOutstandingAllTime: number;
}

export interface DeliveryLedgerSummary {
  totalCashToday: number;
  totalUpiToday: number;
  totalOutstandingAllTime: number;
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

export interface DailyAnalyticsKpis {
  totalRevenue: number;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  deliveredRate: number;
  cancelRate: number;
  averageOrderValue: number;
  codOrders: number;
  prepaidOrders: number;
  prepaidShare: number;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  activeCustomers: number;
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  chatSessions: number;
  chatMessages: number;
  supportHandoffs: number;
}

export interface DailyAnalyticsReportPayload {
  date: string;
  periodStart: string;
  periodEnd: string;
  kpis: DailyAnalyticsKpis;
  topSellingProducts: Array<{ name: string; quantitySold: number; revenue: number }>;
  topProductsOverall: Array<{ _id?: string; name?: string; quantitySold?: number; revenue?: number }>;
  topCustomersOverall: Array<{ _id?: string; customerName?: string; totalSpent?: number; totalOrders?: number }>;
  revenueTrendLast14Days: RevenueDataPoint[];
}

export interface DailyAnalyticsReportResponse {
  snapshotDate: string;
  generatedAt: string;
  summary: string;
  report: DailyAnalyticsReportPayload | null;
}

export interface AnalyticsNarrativeResponse {
  headline: string;
  summary: string;
  highlights: string[];
  watchouts: string[];
  actions: string[];
  generatedBy?: 'gemini' | 'fallback';
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
  direction: 'incoming' | 'outgoing' | 'inbound' | 'outbound';
  type: string;
  content: MessageContent;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  timestamp: string;
  createdAt: string;
}

// ==================== CAMPAIGNS ====================
export interface CampaignRecord {
  _id: string;
  label: string;
  type: 'template' | 'media';
  status: 'queued' | 'sending' | 'done' | 'failed';
  totalPhones: number;
  sent: number;
  skipped: number;
  createdAt: string;
  completedAt?: string;
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

export type CatalogSyncMode = 'dry_run' | 'meta';

export type UcmSyncRunMode = 'dry_run' | 'pull' | 'push';

export interface CatalogSettings {
  syncMode: CatalogSyncMode;
  autoSyncEnabled: boolean;
  selectedCatalogId: string;
  selectedCatalogName: string;
  lastSyncAt: string;
  lastSyncStatus: 'idle' | 'dry_run' | 'syncing' | 'success' | 'failed';
  lastSyncMessage: string;
}

export interface RemoteCatalog {
  id: string;
  name: string;
  product_count?: number;
  vertical?: string;
}

export interface UcmDashboardSnapshot {
  config: CatalogSettings;
  catalogs: RemoteCatalog[];
  productCount: number;
}

export interface UcmSyncDetail {
  retailerId: string;
  status: 'synced' | 'skipped' | 'failed';
  message?: string;
}

export interface UcmSyncSummary {
  mode: UcmSyncRunMode;
  totalProducts: number;
  syncedProducts: number;
  failedProducts: number;
  remoteCatalogId?: string;
  remoteCatalogName?: string;
  details: UcmSyncDetail[];
}

// ==================== APPEARANCE & BANNER TYPES ====================
export type ThemePresetName =
  | 'forest-green'
  | 'ocean-blue'
  | 'royal-purple'
  | 'sunset-orange'
  | 'minimal-dark'
  | 'rose-garden';

export interface ThemePreset {
  label: string;
  description: string;
  colors: Record<string, string>;
}

export interface AppearanceSettings {
  activeTheme: ThemePresetName;
  logoUrl: string;
  logoPublicId: string;
}

export interface HeroBanner {
  id: string;
  imageUrl: string;
  imagePublicId: string;
  videoUrl?: string;
  videoPublicId?: string;
  headline: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  isActive: boolean;
}

export interface AnnouncementBarConfig {
  enabled: boolean;
  text: string;
  linkText: string;
  linkUrl: string;
  backgroundColor: string;
  textColor: string;
}

export interface PromoBanner {
  id: string;
  imageUrl: string;
  imagePublicId: string;
  videoUrl?: string;
  videoPublicId?: string;
  linkUrl?: string;
  label: string;
  isActive: boolean;
}

export interface BannerSettings {
  heroBanners: HeroBanner[];
  announcementBar: AnnouncementBarConfig;
  promoBanners: PromoBanner[];
}

export interface SettingsValue {
  store?: StoreSettings;
  whatsapp?: WhatsAppSettings;
  catalog?: CatalogSettings;
  appearance?: AppearanceSettings;
  banners?: BannerSettings;
  [key: string]: StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings | undefined;
}

export interface Settings {
  _id: string;
  key: string;
  value: StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings;
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
  storeId?: string;
  storeName?: string;
   departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
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

// ==================== COUPON VALIDATION ====================
export interface CouponValidationResult {
  valid: boolean;
  discountAmount: number;
  message: string;
  coupon?: Coupon;
  minOrderAmount?: number;
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
  hsnCode?: string;
  batchInfo?: {
    batchNumber?: string;
    batchDate?: string;
    yieldKg?: number;
    milkLitres?: number;
    origin?: string;
    nextBatchDays?: number;
    purityClaims?: string[];
  };
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  parent?: string;
  sortOrder?: number;
  isActive?: boolean;
  gstPercentage?: number;
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
  assignedTo?: string;
  assignedToName?: string;
  assignedToPhone?: string;
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
  placed: number;
  confirmed: number;
  preparing: number;
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
  total?: number;
  gstPercentage?: number;
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

// ==================== WISHLIST TYPES ====================
export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
  addedAt: string;
}

export interface WishlistResponse {
  items: WishlistItem[];
  itemCount: number;
}

// ==================== WALLET TYPES ====================
export interface WalletBalance {
  balance: number; // rupees
  currency: 'INR';
}

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number; // rupees
  reason: string;
  createdAt: string;
  orderId?: string;
  meta?: Record<string, unknown>;
}

// ==================== ORDER CREATION DTO ====================
export interface CreateOrderDto {
  items?: { productId: string; variantSku?: string; quantity: number }[];
  cartId?: string;
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
  walletAmount?: number;
  idempotencyKey?: string;
  source?: string;
}

export interface GuestCreateOrderDto {
  items: { productId: string; variantSku?: string; quantity: number }[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
  phone: string;
  email?: string;
  name?: string;
  walletAmount?: number;
  idempotencyKey?: string;
  source?: string;
  orderType?: string;
  adminDiscount?: number;
  scheduledFor?: string;
}

export interface ReorderDto {
  orderId: string;
  shippingAddress?: ShippingAddress;
}

export interface UpdateOrderDto {
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  notes?: string;
  adminNotes?: string;
  shippingAddress?: Partial<ShippingAddress>;
  paymentProofUrl?: string;
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

// ==================== STORE TYPES ====================
export interface Store {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isMainStore: boolean;
  isActive: boolean;
  adminEmail?: string;
  adminPassword?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStoreDto {
  name?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

// ==================== FEEDBACK TYPES ====================
export type FeedbackType = 'product_review' | 'order_feedback' | 'general' | 'complaint' | 'suggestion';
export type FeedbackStatus = 'pending' | 'acknowledged' | 'resolved' | 'closed' | 'dismissed';

export interface Feedback {
  _id: string;
  user: User | string;
  order?: string;
  product?: Product | string;
  type: FeedbackType;
  rating?: number;
  message: string;
  images: string[];
  videos: string[];
  reviewerName?: string;
  isAdminCurated?: boolean;
  status: FeedbackStatus;
  adminResponse?: string;
  respondedAt?: string;
  respondedBy?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductReview {
  _id: string;
  user: { name?: string };
  userId?: { name?: string };
  reviewerName?: string;
  isAdminCurated?: boolean;
  rating?: number;
  message: string;
  images?: string[];
  videos?: string[];
  adminResponse?: string;
  createdAt: string;
}

// ==================== RAZORPAY ====================
/** Response from POST /payments/whatsapp-checkout (WhatsApp pay link). */
export interface WhatsAppCheckoutPrepareResult {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  orderNumber: string;
  alreadyPaid: boolean;
  customerName?: string;
  customerPhone?: string;
}

export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description?: string;
      order_id?: string;
      handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
      theme?: { color?: string };
      modal?: { ondismiss?: () => void };
    }) => { open: () => void };
  }
}

export interface VariantStockEntry {
  variantSku: string;
  stock: number;
}

export interface StoreStockItem {
  _id: string;
  store: Store | string;
  product: Product | string;
  stock: number;
  stockIn: number;
  returned: number;
  damaged: number;
  saleLog: number;
  variantStocks: VariantStockEntry[];
  lowStockThreshold: number;
  productName?: string;
  productSku?: string;
  productPrice?: number;
  productImages?: string[];
  productVariants?: ProductVariant[];
  categoryName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockSnapshotItem {
  _id: string;
  date: string;
  stockInDelta: number;
  returnedDelta: number;
  damagedDelta: number;
  saleLogDelta: number;
  totalStock: number;
  entryCount?: number;
  entries?: Array<{
    _id: string;
    loggedAt: string;
    loggedBy?: string;
    loggedByName?: string;
    variantSku?: string;
    stockInDelta: number;
    returnedDelta: number;
    damagedDelta: number;
    saleLogDelta: number;
    resultingStock: number;
  }>;
  productName?: string;
  productSku?: string;
}

export type SaleType = 'walk_in' | 'delivery' | 'website';

export interface SaleItem {
  product: Product | string;
  name: string;
  variantSku?: string;
  variantName?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface StoreSale {
  _id: string;
  saleNumber: string;
  store: Store | string;
  saleType: SaleType;
  items: SaleItem[];
  customerName?: string;
  customerPhone?: string;
  customerAlternatePhone?: string;
  customerAddress?: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentProofUrl?: string;
  images?: string[];
  notes?: string;
  loggedBy: { _id: string; name: string } | string;
  linkedOrder?: string;
  invoiceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== MULTI-STORE ANALYTICS TYPES ====================
export interface StoreRevenueToday {
  storeId: string;
  storeName: string;
  storeCode: string;
  revenue: number;
  salesCount: number;
}

export interface StoreStockSummary {
  storeId: string;
  storeName: string;
  storeCode: string;
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
}

export interface MonthOverMonthData {
  storeId: string;
  storeName: string;
  thisMonth: number;
  thisMonthSales: number;
  lastMonth: number;
  lastMonthSales: number;
  changePercent: number;
}

export interface TopSellingProduct {
  _id: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface TopCustomer {
  _id: string;
  customerName: string;
  totalSpent: number;
  totalOrders: number;
  lastPurchase: string;
}

export interface DropdownSettings {
  cities: string[];
  states: string[];
  deliveryTypes: string[];
  paymentTypes: string[];
}

export interface CreateStoreSaleDto {
  storeId: string;
  saleType: 'walk_in' | 'delivery';
  items: { productId: string; variantSku?: string; quantity: number }[];
  customerName?: string;
  customerPhone?: string;
  customerAlternatePhone?: string;
  customerAddress?: string;
  discount?: number;
  paymentMethod?: string;
  paymentProofUrl?: string;
  images?: string[];
  notes?: string;
  reminderMessage?: string;
  reminderDueAt?: string;
}

export interface UpdateStoreSaleDto {
  storeId: string;
  saleType?: 'walk_in' | 'delivery' | 'website';
  items?: { productId: string; variantSku?: string; quantity: number }[];
  customerName?: string;
  customerPhone?: string;
  customerAlternatePhone?: string;
  customerAddress?: string;
  discount?: number;
  paymentMethod?: string;
  paymentProofUrl?: string;
  images?: string[];
  notes?: string;
}

export interface Reminder {
  _id: string;
  sale?: { _id: string; saleNumber: string; customerName?: string; total: number };
  order?: { _id: string; orderNumber: string; shippingAddress: { name: string }; total: number };
  store?: { _id: string; name: string; code: string };
  message: string;
  dueAt: string;
  createdAt: string;
}

export interface RawMaterialTodayEntry {
  _id: string;
  date: string;
  openingStock: number;
  stockIn: number;
  processed: number;
  outputLitres: number;
  closing: number;
  entryCount?: number;
  entries?: RawMaterialEntryLog[];
}

export interface RawMaterialEntryLog {
  _id: string;
  loggedAt: string;
  loggedBy?: string;
  loggedByName?: string;
  openingStock: number;
  stockIn: number;
  processed: number;
  outputLitres: number;
  closing: number;
}

export interface RawMaterial {
  _id: string;
  store: string;
  name: string;
  unit: string;
  totalStock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  todayEntry: RawMaterialTodayEntry | null;
}

export interface RawMaterialDailyItem {
  _id: string;
  date: string;
  openingStock: number;
  stockIn: number;
  processed: number;
  outputLitres: number;
  closing: number;
  entryCount?: number;
  entries?: RawMaterialEntryLog[];
  materialName?: string;
  materialUnit?: string;
}

export interface RawMaterialPrefill {
  openingStock: number;
  stockIn: number;
  processed: number;
  outputLitres: number;
  closing: number;
  isExisting: boolean;
}

export interface SetStoreStockDto {
  storeId: string;
  productId: string;
  stock?: number;
  stockInDelta?: number;
  returnedDelta?: number;
  damagedDelta?: number;
  saleLogDelta?: number;
  variantSku?: string;
  lowStockThreshold?: number;
  adminPassword?: string;
}

export interface SaleStats {
  totalSales: number;
  totalRevenue: number;
  avgSaleValue: number;
  walkInSales: number;
  deliverySales: number;
  websiteSales: number;
  walkInRevenue: number;
  deliveryRevenue: number;
  websiteRevenue: number;
}

export interface StoreDashboardStats {
  todaySales: number;
  todayRevenue: number;
  monthSales: number;
  monthRevenue: number;
  recentSales: StoreSale[];
  lowStockProducts: StoreStockItem[];
}

export interface MultiStoreRevenueData {
  storeId: string;
  storeName: string;
  data: { date: string; revenue: number; sales: number }[];
}

// ==================== AUDIT TYPES ====================
export interface AuditLog {
  _id: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  targetId?: string;
  targetModel?: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  description?: string;
  ipAddress?: string;
  createdAt: string;
}
