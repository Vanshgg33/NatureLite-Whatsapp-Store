import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ApiResponse,
  AuthResponse,
  User,
  type AdminUser,
  Product,
  Category,
  Order,
  Coupon,
  DashboardStats,
  PaginatedResponse,
  UploadResult,
  CreateProductDto,
  CreateCategoryDto,
  CreateCouponDto,
  UpdateOrderStatusDto,
  UpdateShippingDto,
  OrderStatus,
  PaymentStatus,
  RevenueDataPoint,
  OrderAnalytics,
  CustomerAnalytics,
  ProductAnalytics,
  CouponValidationResult,
  StoreSettings,
  WhatsAppSettings,
  CatalogSettings,
  AppearanceSettings,
  BannerSettings,
  MessageLog,
  OrderStats,
  OrdersByStatus,
  CartResponse,
  CreateOrderDto,
  GuestCreateOrderDto,
  ReorderDto,
  AddAddressDto,
  UpdateAddressDto,
  Address,
  Store,
  StoreStockItem,
  StoreSale,
  CreateStoreSaleDto,
  UpdateStoreSaleDto,
  SetStoreStockDto,
  StoreRevenueToday,
  StoreStockSummary,
  MonthOverMonthData,
  TopSellingProduct,
  TopCustomer,
  SaleStats,
  StoreDashboardStats,
  MultiStoreRevenueData,
  Reminder,
  WishlistResponse,
  WalletBalance,
  WalletTransaction,
  Feedback,
  ProductReview,
  AuditLog,
  WhatsAppCheckoutPrepareResult,
  RemoteCatalog,
  UcmDashboardSnapshot,
  UcmSyncSummary,
} from '@/types';

// Backend API base URL. Set via NEXT_PUBLIC_API_URL in environment.
// Local fallback helps development if env is missing.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      // Rely on HttpOnly cookies for auth (access + refresh)
      // We also fall back to Bearer tokens for browsers that aggressively block 3rd-party cookies (ITP)
      withCredentials: true,
    });

    // Request interceptor to attach Bearer token fallback if available
    this.client.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        try {
          // Check admin store first
          const adminStorage = localStorage.getItem('admin-auth-storage');
          if (adminStorage) {
            const parsed = JSON.parse(adminStorage);
            if (parsed?.state?.accessToken) {
              config.headers.Authorization = `Bearer ${parsed.state.accessToken}`;
              return config;
            }
          }
          // Fallback to customer store
          const customerStorage = localStorage.getItem('customer-auth-storage');
          if (customerStorage) {
            const parsed = JSON.parse(customerStorage);
            if (parsed?.state?.accessToken) {
              config.headers.Authorization = `Bearer ${parsed.state.accessToken}`;
            }
          }
        } catch {
          // ignore parsing errors
        }
      }
      return config;
    });

    // Response interceptor with refresh token retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as typeof error.config & { _retry?: boolean };

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;

          if (!this.isRefreshing) {
            this.isRefreshing = true;

            let refreshTokenToSend: string | undefined;
            if (typeof window !== 'undefined') {
              try {
                const adminStorage = localStorage.getItem('admin-auth-storage');
                if (adminStorage) {
                  const parsed = JSON.parse(adminStorage);
                  if (parsed?.state?.refreshToken) {
                    refreshTokenToSend = parsed.state.refreshToken;
                  }
                }
                const customerStorage = localStorage.getItem('customer-auth-storage');
                if (customerStorage && !refreshTokenToSend) {
                  const parsed = JSON.parse(customerStorage);
                  if (parsed?.state?.refreshToken) {
                    refreshTokenToSend = parsed.state.refreshToken;
                  }
                }
              } catch {
                // ignore parsing errors
              }
            }

            const payload = refreshTokenToSend ? { refreshToken: refreshTokenToSend } : {};

            // Swallow rejection here so all awaiters observe a settled promise
            // without triggering unhandled-rejection warnings. The boolean result
            // lets awaiters know whether they should retry the original request.
            this.refreshPromise = axios
              .post(`${API_URL}/auth/refresh`, payload, { withCredentials: true })
              .then(async (res) => {
                const newTokens = res.data?.data;
                if (newTokens && typeof window !== 'undefined') {
                  try {
                    if (newTokens.user?.role === 'customer') {
                      const { useCustomerStore } = await import('./customer-store');
                      useCustomerStore.getState().setTokens(newTokens.accessToken, newTokens.refreshToken);
                    } else {
                      const { useAdminAuthStore } = await import('./admin-store');
                      useAdminAuthStore.getState().setTokens(newTokens.accessToken, newTokens.refreshToken);
                    }
                  } catch {
                    // ignore module import or state update errors
                  }
                }
                return true as const;
              })
              .catch(() => false as const)
              .finally(() => {
                this.isRefreshing = false;
              }) as unknown as Promise<void>;
          }

          const refreshed = (await this.refreshPromise) as unknown as boolean;
          this.refreshPromise = null;

          if (refreshed) {
            return this.client(originalRequest);
          }

          // Refresh failed — clear SPA auth state and let the route guard handle
          // the redirect via the router. Avoid window.location.href hard-reloads
          // (loses query cache, flashes white) and never redirect if we're
          // already on a login page (prevents login↔dashboard loops when a stale
          // cookie is present but the backend session is gone).
          if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            try {
              // Dynamic import avoids a client/server circular init with Zustand persist.
              const { useAdminAuthStore } = await import('./admin-store');
              useAdminAuthStore.getState().logout();
            } catch {
              // store module unavailable — ignore
            }
            const onAdminLogin = path === '/admin-login' || path.startsWith('/admin-login');
            const onDeptLogin = path === '/department-login' || path.startsWith('/department-login');
            if (path.startsWith('/admin') && !onAdminLogin) {
              window.location.assign('/admin-login');
            } else if (path.startsWith('/department') && !onDeptLogin) {
              window.location.assign('/department-login');
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // ==================== AUTH ====================
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/admin/login', {
      email,
      password,
    });
    // Cookie is set by the backend in the response
    return response.data.data;
  }

  async register(name: string, email: string, password: string, phone?: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/admin/register', {
      name,
      email,
      password,
      phone,
    });
    // Cookie is set by the backend in the response
    return response.data.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout', {});
  }

  async getProfile(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/auth/profile');
    return response.data.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/change-password', { currentPassword, newPassword });
  }

  // ==================== ADMIN USERS (LOGINS) ====================
  async getAdminUsers(): Promise<AdminUser[]> {
    const response = await this.client.get<ApiResponse<AdminUser[]>>('/admin/users');
    return response.data.data;
  }

  async createAdminUser(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'admin' | 'superadmin';
    departmentType?: 'packing' | 'billing' | 'delivery';
  }): Promise<AdminUser> {
    const response = await this.client.post<ApiResponse<AdminUser>>('/admin/users', data);
    return response.data.data;
  }

  async updateAdminUser(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: 'admin' | 'superadmin';
      isActive?: boolean;
      permissions?: string[];
      departmentType?: 'packing' | 'billing' | 'delivery';
    }
  ): Promise<AdminUser> {
    const response = await this.client.put<ApiResponse<AdminUser>>(`/admin/users/${id}`, data);
    return response.data.data;
  }

  async resetAdminUserPassword(id: string, password: string): Promise<void> {
    await this.client.put(`/admin/users/${id}/reset-password`, { password });
  }

  async deleteAdminUser(id: string): Promise<void> {
    await this.client.delete(`/admin/users/${id}`);
  }

  // ==================== CUSTOMER AUTH ====================
  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post<ApiResponse<{ success: boolean; message: string }>>('/auth/customer/send-otp', {
      phone,
    });
    return response.data.data;
  }

  async customerLogin(phone: string, otp: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/customer/login', {
      phone,
      otp,
    });
    return response.data.data;
  }

  async customerEmailLogin(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/customer/email-login', {
      email,
      password,
    });
    return response.data.data;
  }

  async customerRegister(data: { name?: string; email?: string; phone?: string; password?: string }): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/customer/register', data);
    return response.data.data;
  }

  // ==================== CART ====================
  async getCart(): Promise<CartResponse> {
    const response = await this.client.get<ApiResponse<CartResponse>>('/cart');
    return response.data.data;
  }

  async addToCart(productId: string, quantity: number = 1, variantSku?: string): Promise<CartResponse> {
    const response = await this.client.post<ApiResponse<CartResponse>>('/cart/items', {
      productId,
      quantity,
      variantSku,
    });
    return response.data.data;
  }

  async updateCartItem(productId: string, quantity: number, variantSku?: string): Promise<CartResponse> {
    const url = variantSku ? `/cart/items/${productId}?variantSku=${variantSku}` : `/cart/items/${productId}`;
    const response = await this.client.put<ApiResponse<CartResponse>>(url, { quantity });
    return response.data.data;
  }

  async removeFromCart(productId: string, variantSku?: string): Promise<CartResponse> {
    const url = variantSku ? `/cart/items/${productId}?variantSku=${variantSku}` : `/cart/items/${productId}`;
    const response = await this.client.delete<ApiResponse<CartResponse>>(url);
    return response.data.data;
  }

  async clearCart(): Promise<void> {
    await this.client.delete('/cart');
  }

  async applyCartCoupon(couponCode: string): Promise<CartResponse> {
    const response = await this.client.post<ApiResponse<CartResponse>>('/cart/coupon', { couponCode });
    return response.data.data;
  }

  async removeCartCoupon(): Promise<CartResponse> {
    const response = await this.client.delete<ApiResponse<CartResponse>>('/cart/coupon');
    return response.data.data;
  }

  // ==================== CUSTOMER ORDERS ====================
  async createOrder(data: CreateOrderDto): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>('/orders', data);
    return response.data.data;
  }

  async createGuestOrder(data: GuestCreateOrderDto): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>('/orders/guest', data);
    return response.data.data;
  }

  async getMyOrders(limit: number = 10): Promise<Order[]> {
    const response = await this.client.get<ApiResponse<Order[]>>(`/orders/my-orders?limit=${limit}`);
    return response.data.data;
  }

  async reorder(data: ReorderDto): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>('/orders/reorder', data);
    return response.data.data;
  }

  // ==================== CUSTOMER PROFILE ====================
  async getMyProfile(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/users/me');
    return response.data.data;
  }

  async updateMyProfile(data: { name?: string; email?: string }): Promise<User> {
    const response = await this.client.put<ApiResponse<User>>('/users/me', data);
    return response.data.data;
  }

  async addAddress(address: AddAddressDto): Promise<User> {
    const response = await this.client.post<ApiResponse<User>>('/users/me/addresses', address);
    return response.data.data;
  }

  async updateAddress(index: number, address: UpdateAddressDto): Promise<User> {
    const response = await this.client.put<ApiResponse<User>>(`/users/me/addresses/${index}`, address);
    return response.data.data;
  }

  async deleteAddress(index: number): Promise<User> {
    const response = await this.client.delete<ApiResponse<User>>(`/users/me/addresses/${index}`);
    return response.data.data;
  }

  // ==================== ANALYTICS ====================
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.client.get<ApiResponse<DashboardStats>>('/analytics/dashboard');
    return response.data.data;
  }

  async getRevenueByDay(days: number = 30): Promise<RevenueDataPoint[]> {
    const response = await this.client.get<ApiResponse<RevenueDataPoint[]>>(
      `/analytics/revenue?days=${days}`
    );
    return response.data.data;
  }

  async getOrderAnalytics(startDate: string, endDate: string): Promise<OrderAnalytics> {
    const response = await this.client.get<ApiResponse<OrderAnalytics>>(
      `/analytics/orders?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data.data;
  }

  async getCustomerAnalytics(startDate: string, endDate: string): Promise<CustomerAnalytics> {
    const response = await this.client.get<ApiResponse<CustomerAnalytics>>(
      `/analytics/customers?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data.data;
  }

  async getProductAnalytics(startDate: string, endDate: string): Promise<ProductAnalytics> {
    const response = await this.client.get<ApiResponse<ProductAnalytics>>(
      `/analytics/products?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data.data;
  }

  // ==================== PRODUCTS ====================
  async getProducts(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    inStock?: boolean;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Product>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Product>>>('/products', { params });
    return response.data.data;
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.client.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data.data;
  }

  async getProductBySlug(slug: string): Promise<Product> {
    const response = await this.client.get<ApiResponse<Product>>(`/products/slug/${slug}`);
    return response.data.data;
  }

  async getFeaturedProducts(limit: number = 10): Promise<Product[]> {
    const response = await this.client.get<ApiResponse<Product[]>>(`/products/featured?limit=${limit}`);
    return response.data.data;
  }

  async getLowStockProducts(): Promise<Product[]> {
    const response = await this.client.get<ApiResponse<Product[]>>('/products/low-stock');
    return response.data.data;
  }

  async searchProducts(query: string, limit: number = 10): Promise<Product[]> {
    const response = await this.client.get<ApiResponse<Product[]>>(`/products/search?q=${query}&limit=${limit}`);
    return response.data.data;
  }

  async createProduct(data: CreateProductDto): Promise<Product> {
    const response = await this.client.post<ApiResponse<Product>>('/products', data);
    return response.data.data;
  }

  async updateProduct(id: string, data: Partial<CreateProductDto>): Promise<Product> {
    const response = await this.client.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data.data;
  }

  async updateProductStock(id: string, stock: number, variantSku?: string): Promise<Product> {
    const response = await this.client.put<ApiResponse<Product>>(`/products/${id}/stock`, { stock, variantSku });
    return response.data.data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  // ==================== CATEGORIES ====================
  async getCategories(params?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
    parent?: string;
    rootOnly?: boolean;
  }): Promise<PaginatedResponse<Category>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Category>>>('/categories', { params });
    return response.data.data;
  }

  async getCategoryTree(): Promise<Category[]> {
    const response = await this.client.get<ApiResponse<Category[]>>('/categories/tree');
    return response.data.data;
  }

  async getActiveCategories(): Promise<Category[]> {
    const response = await this.client.get<ApiResponse<Category[]>>('/categories/active');
    return response.data.data;
  }

  async getCategory(id: string): Promise<Category> {
    const response = await this.client.get<ApiResponse<Category>>(`/categories/${id}`);
    return response.data.data;
  }

  async createCategory(data: CreateCategoryDto): Promise<Category> {
    const response = await this.client.post<ApiResponse<Category>>('/categories', data);
    return response.data.data;
  }

  async updateCategory(id: string, data: Partial<CreateCategoryDto>): Promise<Category> {
    const response = await this.client.put<ApiResponse<Category>>(`/categories/${id}`, data);
    return response.data.data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  // ==================== ORDERS ====================
  async getOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    search?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    customerId?: string;
    userId?: string;
    forPacking?: boolean;
    forBilling?: boolean;
    forDelivery?: boolean;
  }): Promise<PaginatedResponse<Order>> {
    const { customerId, userId, ...rest } = params;
    const query = { ...rest, userId: userId ?? customerId };
    const response = await this.client.get<ApiResponse<PaginatedResponse<Order>>>('/orders', { params: query });
    return response.data.data;
  }

  async getOrder(id: string): Promise<Order> {
    const response = await this.client.get<ApiResponse<Order>>(`/orders/${id}`);
    return response.data.data;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order> {
    const response = await this.client.get<ApiResponse<Order>>(`/orders/number/${orderNumber}`);
    return response.data.data;
  }

  async getOrderStats(startDate?: string, endDate?: string): Promise<OrderStats> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const response = await this.client.get<ApiResponse<OrderStats>>(`/orders/stats?${params}`);
    return response.data.data;
  }

  async getOrdersByStatus(): Promise<OrdersByStatus> {
    const response = await this.client.get<ApiResponse<OrdersByStatus>>('/orders/by-status');
    return response.data.data;
  }

  async updateOrderStatus(id: string, data: UpdateOrderStatusDto): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/status`, data);
    return response.data.data;
  }

  async markOrderPacked(id: string): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/mark-packed`);
    return response.data.data;
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus, transactionId?: string): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/payment-status`, {
      paymentStatus,
      transactionId,
    });
    return response.data.data;
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>(`/orders/${id}/cancel`, { reason });
    return response.data.data;
  }

  async requestReturn(id: string, reason: string): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>(`/orders/${id}/request-return`, {
      reason,
    });
    return response.data.data;
  }

  async addOrderNote(id: string, note: string): Promise<Order> {
    const response = await this.client.post<ApiResponse<Order>>(`/orders/${id}/notes`, { note });
    return response.data.data;
  }

  async updateOrderShipping(id: string, data: UpdateShippingDto): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/shipping`, data);
    return response.data.data;
  }

  async updateOrderPriorityTags(id: string, tags: string[]): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/priority-tags`, { tags });
    return response.data.data;
  }

  async updateDeliveryWorkflow(
    id: string,
    data: {
      status: 'delivery_done' | 'customer_ringing' | 'customer_cancelled' | 'customer_tomorrow';
      paymentMethod?: 'cash' | 'upi';
      paymentProofUrl?: string;
      note?: string;
    }
  ): Promise<Order> {
    const response = await this.client.put<ApiResponse<Order>>(`/orders/${id}/delivery-workflow`, data);
    return response.data.data;
  }

  // ==================== USERS ====================
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isBlocked?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<User>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<User>>>('/users', { params });
    return response.data.data;
  }

  async getUser(id: string): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>(`/users/${id}`);
    return response.data.data;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const response = await this.client.put<ApiResponse<User>>(`/users/${id}`, data);
    return response.data.data;
  }

  async blockUser(id: string, reason: string): Promise<User> {
    const response = await this.client.post<ApiResponse<User>>(`/users/${id}/block`, { reason });
    return response.data.data;
  }

  async unblockUser(id: string): Promise<User> {
    const response = await this.client.post<ApiResponse<User>>(`/users/${id}/unblock`);
    return response.data.data;
  }

  async deleteUser(id: string): Promise<void> {
    await this.client.delete(`/users/${id}`);
  }

  // ==================== COUPONS ====================
  async getCoupons(params?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
    search?: string;
  }): Promise<PaginatedResponse<Coupon>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Coupon>>>('/coupons', { params });
    return response.data.data;
  }

  async getActiveCoupons(): Promise<Coupon[]> {
    const response = await this.client.get<ApiResponse<Coupon[]>>('/coupons/active');
    return response.data.data;
  }

  async getCoupon(id: string): Promise<Coupon> {
    const response = await this.client.get<ApiResponse<Coupon>>(`/coupons/${id}`);
    return response.data.data;
  }

  async getCouponByCode(code: string): Promise<Coupon> {
    const response = await this.client.get<ApiResponse<Coupon>>(`/coupons/code/${code}`);
    return response.data.data;
  }

  async createCoupon(data: CreateCouponDto): Promise<Coupon> {
    const response = await this.client.post<ApiResponse<Coupon>>('/coupons', data);
    return response.data.data;
  }

  async updateCoupon(id: string, data: Partial<CreateCouponDto>): Promise<Coupon> {
    const response = await this.client.put<ApiResponse<Coupon>>(`/coupons/${id}`, data);
    return response.data.data;
  }

  async deleteCoupon(id: string): Promise<void> {
    await this.client.delete(`/coupons/${id}`);
  }

  async validateCoupon(
    code: string,
    orderAmount: number,
    userId?: string,
    productIds?: string[],
    categoryIds?: string[]
  ): Promise<CouponValidationResult> {
    const response = await this.client.post<ApiResponse<CouponValidationResult>>(
      '/coupons/validate',
      { code, orderAmount, userId, productIds, categoryIds }
    );
    return response.data.data;
  }

  // ==================== SETTINGS ====================
  async getSettings(): Promise<{ store?: StoreSettings; whatsapp?: WhatsAppSettings; catalog?: CatalogSettings; appearance?: AppearanceSettings; banners?: BannerSettings }> {
    const response = await this.client.get<ApiResponse<{ store?: StoreSettings; whatsapp?: WhatsAppSettings; catalog?: CatalogSettings; appearance?: AppearanceSettings; banners?: BannerSettings }>>('/settings');
    return response.data.data;
  }

  async getPublicSettings(): Promise<{ store?: StoreSettings; appearance?: AppearanceSettings; banners?: BannerSettings }> {
    const response = await this.client.get<ApiResponse<{ store?: StoreSettings; appearance?: AppearanceSettings; banners?: BannerSettings }>>('/settings/public');
    return response.data.data;
  }

  async getSetting(key: 'store'): Promise<StoreSettings | null>;
  async getSetting(key: 'whatsapp'): Promise<WhatsAppSettings | null>;
  async getSetting(key: 'catalog'): Promise<CatalogSettings | null>;
  async getSetting(key: 'appearance'): Promise<AppearanceSettings | null>;
  async getSetting(key: 'banners'): Promise<BannerSettings | null>;
  async getSetting(key: string): Promise<StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings | null> {
    const response = await this.client.get<ApiResponse<StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings | null>>(`/settings/${key}`);
    return response.data.data;
  }

  async updateSettings(key: 'store', updates: Partial<StoreSettings>): Promise<StoreSettings>;
  async updateSettings(key: 'whatsapp', updates: Partial<WhatsAppSettings>): Promise<WhatsAppSettings>;
  async updateSettings(key: 'catalog', updates: Partial<CatalogSettings>): Promise<CatalogSettings>;
  async updateSettings(key: 'appearance', updates: Partial<AppearanceSettings>): Promise<AppearanceSettings>;
  async updateSettings(key: 'banners', updates: Partial<BannerSettings>): Promise<BannerSettings>;
  async updateSettings(key: string, updates: Partial<StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings>): Promise<StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings> {
    const response = await this.client.put<ApiResponse<StoreSettings | WhatsAppSettings | CatalogSettings | AppearanceSettings | BannerSettings>>(`/settings/${key}/update`, updates);
    return response.data.data;
  }

  // ==================== UCM / CATALOG ====================
  async getUcmDashboard(): Promise<UcmDashboardSnapshot> {
    const response = await this.client.get<ApiResponse<UcmDashboardSnapshot>>('/ucm/dashboard');
    return response.data.data;
  }

  async getUcmCatalogs(): Promise<RemoteCatalog[]> {
    const response = await this.client.get<ApiResponse<RemoteCatalog[]>>('/ucm/catalogs');
    return response.data.data;
  }

  async getUcmConfig(): Promise<CatalogSettings> {
    const response = await this.client.get<ApiResponse<CatalogSettings>>('/ucm/config');
    return response.data.data;
  }

  async updateUcmConfig(updates: Partial<CatalogSettings>): Promise<CatalogSettings> {
    // Only send fields that the backend DTO accepts
    const payload = {
      ...(updates.syncMode !== undefined && { syncMode: updates.syncMode }),
      ...(updates.autoSyncEnabled !== undefined && { autoSyncEnabled: updates.autoSyncEnabled }),
      ...(updates.selectedCatalogId !== undefined && { selectedCatalogId: updates.selectedCatalogId }),
      ...(updates.selectedCatalogName !== undefined && { selectedCatalogName: updates.selectedCatalogName }),
    };
    const response = await this.client.put<ApiResponse<CatalogSettings>>('/ucm/config', payload);
    return response.data.data;
  }

  async syncUcmCatalog(): Promise<UcmSyncSummary> {
    const response = await this.client.post<ApiResponse<UcmSyncSummary>>('/ucm/sync/push', {});
    return response.data.data;
  }

  async pushUcmCatalog(): Promise<UcmSyncSummary> {
    const response = await this.client.post<ApiResponse<UcmSyncSummary>>('/ucm/sync/push', {});
    return response.data.data;
  }

  async pullUcmCatalog(): Promise<UcmSyncSummary> {
    const response = await this.client.post<ApiResponse<UcmSyncSummary>>('/ucm/sync/pull', {});
    return response.data.data;
  }

  async syncUcmProduct(productId: string): Promise<{ success: boolean }> {
    const response = await this.client.post<ApiResponse<{ success: boolean }>>(`/ucm/sync/${productId}`, {});
    return response.data.data;
  }

  async deleteUcmCatalog(catalogId: string): Promise<{ success: boolean }> {
    const response = await this.client.delete<ApiResponse<{ success: boolean }>>(`/ucm/catalogs/${catalogId}`);
    return response.data.data;
  }

  // ==================== MEDIA ====================
  async uploadImage(file: File, folder?: string): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) {
      formData.append('folder', folder);
    }

    const response = await this.client.post<ApiResponse<UploadResult>>(
      '/media/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data;
  }

  async uploadMultipleImages(files: File[], folder?: string): Promise<UploadResult[]> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (folder) {
      formData.append('folder', folder);
    }

    const response = await this.client.post<ApiResponse<UploadResult[]>>(
      '/media/upload/multiple',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data;
  }

  async uploadImageFromUrl(url: string, folder?: string): Promise<UploadResult> {
    const response = await this.client.post<ApiResponse<UploadResult>>('/media/upload/url', { url, folder });
    return response.data.data;
  }

  async deleteImage(publicId: string): Promise<boolean> {
    const response = await this.client.delete<ApiResponse<{ success: boolean }>>(`/media/${encodeURIComponent(publicId)}`);
    return response.data.data.success;
  }

  async deleteMultipleImages(publicIds: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const response = await this.client.post<ApiResponse<{ deleted: string[]; failed: string[] }>>(
      '/media/delete/multiple',
      { publicIds }
    );
    return response.data.data;
  }

  // ==================== WHATSAPP ====================
  async sendWhatsAppMessage(phone: string, message: string): Promise<{ messageId: string | null }> {
    const response = await this.client.post<ApiResponse<{ messageId: string | null }>>('/whatsapp/send/text', {
      phone,
      message,
    });
    return response.data.data;
  }

  async sendWhatsAppTemplate(
    phone: string,
    templateName: string,
    bodyParams?: string[],
    headerParams?: string[],
    buttonParams?: string[]
  ): Promise<{ messageId: string | null }> {
    const response = await this.client.post<ApiResponse<{ messageId: string | null }>>('/whatsapp/send/template', {
      phone,
      templateName,
      bodyParams,
      headerParams,
      buttonParams,
    });
    return response.data.data;
  }

  async sendWhatsAppButtons(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<{ messageId: string | null }> {
    const response = await this.client.post<ApiResponse<{ messageId: string | null }>>('/whatsapp/send/buttons', {
      phone,
      bodyText,
      buttons,
      headerText,
      footerText,
    });
    return response.data.data;
  }

  async sendWhatsAppList(
    phone: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    headerText?: string,
    footerText?: string
  ): Promise<{ messageId: string | null }> {
    const response = await this.client.post<ApiResponse<{ messageId: string | null }>>('/whatsapp/send/list', {
      phone,
      bodyText,
      buttonText,
      sections,
      headerText,
      footerText,
    });
    return response.data.data;
  }

  async sendWhatsAppMedia(
    phone: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    filename?: string
  ): Promise<{ messageId: string | null }> {
    const response = await this.client.post<ApiResponse<{ messageId: string | null }>>('/whatsapp/send/media', {
      phone,
      mediaType,
      mediaUrl,
      caption,
      filename,
    });
    return response.data.data;
  }

  async getWhatsAppMessages(phone: string, limit: number = 50): Promise<MessageLog[]> {
    const response = await this.client.get<ApiResponse<MessageLog[]>>(`/whatsapp/messages/${phone}?limit=${limit}`);
    return response.data.data;
  }

  async listWhatsAppConversations(limit: number = 50): Promise<Array<{
    phone: string;
    name: string | null;
    lastMessage: {
      preview: string;
      direction: 'inbound' | 'outbound';
      status?: string;
      at: string;
    };
  }>> {
    const response = await this.client.get<ApiResponse<Array<{
      phone: string;
      name: string | null;
      lastMessage: {
        preview: string;
        direction: 'inbound' | 'outbound';
        status?: string;
        at: string;
      };
    }>>>(`/whatsapp/conversations?limit=${limit}`);
    return response.data.data;
  }

  async updateWhatsAppContactName(phone: string, name: string): Promise<{ phone: string; name: string }> {
    const response = await this.client.patch<ApiResponse<{ phone: string; name: string }>>(
      `/whatsapp/contacts/${phone}`,
      { name },
    );
    return response.data.data;
  }

  // ==================== NOTIFICATIONS ====================
  async sendBroadcast(
    phones: string[],
    templateName: string,
    params: string[],
    options?: {
      languageCode?: string;
      headerParams?: string[];
      bodyParams?: string[];
      buttonParams?: string[];
    }
  ): Promise<{ queued: number; skipped: number }> {
    const response = await this.client.post<ApiResponse<{ queued: number; skipped: number }>>('/notifications/broadcast', {
      phones,
      templateName,
      params,
      ...options,
    });
    return response.data.data;
  }

  // ==================== PAYMENTS ====================
  async createPaymentOrder(orderId: string): Promise<{
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
  }> {
    const response = await this.client.post<ApiResponse<{
      razorpayOrderId: string;
      amount: number;
      currency: string;
      keyId: string;
    }>>('/payments/create-order', { orderId });
    return response.data.data;
  }

  async verifyPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<void> {
    await this.client.post('/payments/verify', data);
  }

  /** Public: load Razorpay order for WhatsApp pay link (no auth cookies required). */
  async whatsappPrepareCheckout(
    orderId: string,
    token: string,
  ): Promise<WhatsAppCheckoutPrepareResult> {
    const response = await this.client.post<ApiResponse<WhatsAppCheckoutPrepareResult>>(
      '/payments/whatsapp-checkout',
      { orderId, token },
    );
    return response.data.data;
  }

  async whatsappVerifyPayment(data: {
    payToken: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<void> {
    await this.client.post('/payments/whatsapp-verify', data);
  }

  // ==================== FEEDBACK ====================
  async createFeedback(data: {
    type: string;
    orderId?: string;
    productId?: string;
    rating?: number;
    message: string;
    images?: string[];
  }): Promise<Feedback> {
    const response = await this.client.post<ApiResponse<Feedback>>('/feedback', data);
    return response.data.data;
  }

  async getProductReviews(productId: string): Promise<ProductReview[]> {
    const response = await this.client.get<ApiResponse<ProductReview[]>>(`/feedback/product/${productId}`);
    return response.data.data;
  }

  async getMyFeedback(): Promise<Feedback[]> {
    const response = await this.client.get<ApiResponse<Feedback[]>>('/feedback/my');
    return response.data.data;
  }

  async getAllFeedback(params?: { page?: number; limit?: number; type?: string; status?: string }): Promise<PaginatedResponse<Feedback>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Feedback>>>('/feedback', { params });
    return response.data.data;
  }

  async respondToFeedback(id: string, response: string): Promise<Feedback> {
    const res = await this.client.put<ApiResponse<Feedback>>(`/feedback/${id}/respond`, { response });
    return res.data.data;
  }

  async updateFeedbackStatus(id: string, status: string): Promise<Feedback> {
    const res = await this.client.put<ApiResponse<Feedback>>(`/feedback/${id}/status`, { status });
    return res.data.data;
  }

  // ==================== AUDIT ====================
  async getAuditLogs(params?: { page?: number; limit?: number; action?: string }): Promise<PaginatedResponse<AuditLog>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<AuditLog>>>('/audit', { params });
    return response.data.data;
  }

  // ==================== STORES ====================
  async getStores(): Promise<Store[]> {
    const response = await this.client.get<ApiResponse<Store[]>>('/stores');
    return response.data.data;
  }

  async getStore(id: string): Promise<Store> {
    const response = await this.client.get<ApiResponse<Store>>(`/stores/${id}`);
    return response.data.data;
  }

  async createStore(data: { name: string; code: string; address?: string; phone?: string }): Promise<Store> {
    const response = await this.client.post<ApiResponse<Store>>('/stores', data);
    return response.data.data;
  }

  async updateStore(id: string, data: Partial<{ name: string; address: string; phone: string; isActive: boolean }>): Promise<Store> {
    const response = await this.client.put<ApiResponse<Store>>(`/stores/${id}`, data);
    return response.data.data;
  }

  async resetStorePassword(storeId: string, newPassword: string): Promise<{ message: string }> {
    const response = await this.client.put<ApiResponse<{ message: string }>>(`/stores/${storeId}/reset-password`, { newPassword });
    return response.data.data;
  }

  // ==================== STORE STOCK ====================
  async getStoreStock(storeId: string, params?: { page?: number; limit?: number; search?: string; category?: string; lowStockOnly?: boolean; inStockOnly?: boolean }): Promise<PaginatedResponse<StoreStockItem>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<StoreStockItem>>>(`/store-stock/store/${storeId}`, { params });
    return response.data.data;
  }

  async getProductStockAllStores(productId: string): Promise<StoreStockItem[]> {
    const response = await this.client.get<ApiResponse<StoreStockItem[]>>(`/store-stock/product/${productId}`);
    return response.data.data;
  }

  async setStoreStock(data: SetStoreStockDto): Promise<StoreStockItem> {
    const response = await this.client.put<ApiResponse<StoreStockItem>>('/store-stock', data);
    return response.data.data;
  }

  async bulkSetStoreStock(storeId: string, items: { productId: string; stock: number; variantSku?: string }[]): Promise<void> {
    await this.client.put('/store-stock/bulk', { storeId, items });
  }

  async getLowStockByStore(storeId: string): Promise<StoreStockItem[]> {
    const response = await this.client.get<ApiResponse<StoreStockItem[]>>(`/store-stock/store/${storeId}/low-stock`);
    return response.data.data;
  }

  // ==================== STORE SALES ====================
  async logSale(data: CreateStoreSaleDto): Promise<StoreSale> {
    const response = await this.client.post<ApiResponse<StoreSale>>('/store-sales', data);
    return response.data.data;
  }

  async getStoreSales(storeId: string, params?: { page?: number; limit?: number; saleType?: string; startDate?: string; endDate?: string; search?: string }): Promise<PaginatedResponse<StoreSale>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<StoreSale>>>(`/store-sales/store/${storeId}`, { params });
    return response.data.data;
  }

  async getAllStoreSales(params?: { page?: number; limit?: number; saleType?: string; startDate?: string; endDate?: string; search?: string }): Promise<PaginatedResponse<StoreSale>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<StoreSale>>>('/store-sales', { params });
    return response.data.data;
  }

  async getSaleStats(storeId: string, startDate?: string, endDate?: string): Promise<SaleStats> {
    const response = await this.client.get<ApiResponse<SaleStats>>(`/store-sales/stats/${storeId}`, { params: { startDate, endDate } });
    return response.data.data;
  }

  async getSaleById(id: string, storeId?: string): Promise<StoreSale> {
    const params = storeId ? { storeId } : {};
    const response = await this.client.get<ApiResponse<StoreSale>>(`/store-sales/${id}`, { params });
    return response.data.data;
  }

  async updateSale(id: string, data: UpdateStoreSaleDto): Promise<StoreSale> {
    const response = await this.client.patch<ApiResponse<StoreSale>>(`/store-sales/${id}`, data);
    return response.data.data;
  }

  // ==================== REMINDERS ====================
  async getDueReminders(): Promise<Reminder[]> {
    const response = await this.client.get<ApiResponse<Reminder[]>>('/reminders/due');
    return response.data.data;
  }

  async dismissReminder(id: string): Promise<Reminder> {
    const response = await this.client.post<ApiResponse<Reminder>>(`/reminders/${id}/dismiss`);
    return response.data.data;
  }

  // ==================== MULTI-STORE ANALYTICS ====================
  async getStoreDashboardStats(storeId: string): Promise<StoreDashboardStats> {
    const response = await this.client.get<ApiResponse<StoreDashboardStats>>(`/analytics/stores/dashboard/${storeId}`);
    return response.data.data;
  }

  async getTodayRevenuePerStore(): Promise<StoreRevenueToday[]> {
    const response = await this.client.get<ApiResponse<StoreRevenueToday[]>>('/analytics/stores/today');
    return response.data.data;
  }

  async getMultiStoreRevenue(days: number = 30): Promise<MultiStoreRevenueData[]> {
    const response = await this.client.get<ApiResponse<MultiStoreRevenueData[]>>('/analytics/stores/revenue-comparison', { params: { days } });
    return response.data.data;
  }

  async getStockSummaryPerStore(): Promise<StoreStockSummary[]> {
    const response = await this.client.get<ApiResponse<StoreStockSummary[]>>('/analytics/stores/stock-summary');
    return response.data.data;
  }

  async getTopSellingByStore(storeId: string, startDate?: string, endDate?: string): Promise<TopSellingProduct[]> {
    const response = await this.client.get<ApiResponse<TopSellingProduct[]>>(`/analytics/stores/top-products/${storeId}`, { params: { startDate, endDate } });
    return response.data.data;
  }

  async getTopSellingOverall(startDate?: string, endDate?: string): Promise<TopSellingProduct[]> {
    const response = await this.client.get<ApiResponse<TopSellingProduct[]>>('/analytics/stores/top-products', { params: { startDate, endDate } });
    return response.data.data;
  }

  async getMonthOverMonthByStore(): Promise<MonthOverMonthData[]> {
    const response = await this.client.get<ApiResponse<MonthOverMonthData[]>>('/analytics/stores/month-over-month');
    return response.data.data;
  }

  async getTopCustomersByStore(storeId: string): Promise<TopCustomer[]> {
    const response = await this.client.get<ApiResponse<TopCustomer[]>>(`/analytics/stores/top-customers/${storeId}`);
    return response.data.data;
  }

  async getTopCustomersOverall(): Promise<TopCustomer[]> {
    const response = await this.client.get<ApiResponse<TopCustomer[]>>('/analytics/stores/top-customers');
    return response.data.data;
  }

  // ==================== WISHLIST ====================
  async getWishlist(): Promise<WishlistResponse> {
    const response = await this.client.get<ApiResponse<WishlistResponse>>('/wishlist');
    return response.data.data;
  }

  async addToWishlist(productId: string): Promise<WishlistResponse> {
    const response = await this.client.post<ApiResponse<WishlistResponse>>('/wishlist/items', {
      productId,
    });
    return response.data.data;
  }

  async removeFromWishlist(productId: string): Promise<WishlistResponse> {
    const response = await this.client.delete<ApiResponse<WishlistResponse>>(
      `/wishlist/items/${productId}`,
    );
    return response.data.data;
  }

  async clearWishlist(): Promise<WishlistResponse> {
    const response = await this.client.delete<ApiResponse<WishlistResponse>>('/wishlist');
    return response.data.data;
  }

  // ==================== WALLET ====================
  async getWallet(): Promise<WalletBalance> {
    const response = await this.client.get<ApiResponse<WalletBalance>>('/wallet');
    return response.data.data;
  }

  async getWalletTransactions(): Promise<WalletTransaction[]> {
    const response = await this.client.get<ApiResponse<{ transactions: WalletTransaction[] }>>(
      '/wallet/transactions',
    );
    return response.data.data.transactions;
  }

  async adminGetWallet(userId: string): Promise<WalletBalance & { transactions: WalletTransaction[] }> {
    const response = await this.client.get<
      ApiResponse<WalletBalance & { transactions: WalletTransaction[] }>
    >(`/admin/wallet/${userId}`);
    return response.data.data;
  }

  async adminCreditWallet(userId: string, amount: number, note?: string): Promise<WalletBalance> {
    const response = await this.client.post<ApiResponse<WalletBalance>>(
      `/admin/wallet/${userId}/credit`,
      { amount, note },
    );
    return response.data.data;
  }

  async adminDebitWallet(userId: string, amount: number, note?: string): Promise<WalletBalance> {
    const response = await this.client.post<ApiResponse<WalletBalance>>(
      `/admin/wallet/${userId}/debit`,
      { amount, note },
    );
    return response.data.data;
  }
}

export const api = new ApiClient();
