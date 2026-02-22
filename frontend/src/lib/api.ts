import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ApiResponse,
  AuthResponse,
  User,
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
  ShippingRate,
  ShipmentResponse,
  TrackingInfo,
  MessageLog,
  OrderStats,
  OrdersByStatus,
  CartResponse,
  CreateOrderDto,
  ReorderDto,
  AddAddressDto,
  UpdateAddressDto,
  Address,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Send cookies with every request
    });

    // Request interceptor to add customer token
    this.client.interceptors.request.use(
      (config) => {
        if (typeof window !== 'undefined') {
          const customerToken = localStorage.getItem('customer-token');
          if (customerToken && !config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${customerToken}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          if (typeof window !== 'undefined') {
            // Check if we're on a customer page or admin page
            const isAdminPage = window.location.pathname.startsWith('/admin');
            if (isAdminPage) {
              window.location.href = '/admin-login';
            }
            // For customer pages, just reject - let the page handle it
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
    // Call backend to clear the httpOnly cookie
    await this.client.post('/auth/logout');
  }

  async getProfile(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/auth/profile');
    return response.data.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/change-password', { currentPassword, newPassword });
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
  }): Promise<PaginatedResponse<Order>> {
    const response = await this.client.get<ApiResponse<PaginatedResponse<Order>>>('/orders', { params });
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
  async getSettings(): Promise<{ store?: StoreSettings; whatsapp?: WhatsAppSettings }> {
    const response = await this.client.get<ApiResponse<{ store?: StoreSettings; whatsapp?: WhatsAppSettings }>>('/settings');
    return response.data.data;
  }

  async getPublicSettings(): Promise<{ store?: StoreSettings }> {
    const response = await this.client.get<ApiResponse<{ store?: StoreSettings }>>('/settings/public');
    return response.data.data;
  }

  async getSetting(key: 'store'): Promise<StoreSettings | null>;
  async getSetting(key: 'whatsapp'): Promise<WhatsAppSettings | null>;
  async getSetting(key: string): Promise<StoreSettings | WhatsAppSettings | null> {
    const response = await this.client.get<ApiResponse<StoreSettings | WhatsAppSettings | null>>(`/settings/${key}`);
    return response.data.data;
  }

  async updateSettings(key: 'store', updates: Partial<StoreSettings>): Promise<StoreSettings>;
  async updateSettings(key: 'whatsapp', updates: Partial<WhatsAppSettings>): Promise<WhatsAppSettings>;
  async updateSettings(key: string, updates: Partial<StoreSettings> | Partial<WhatsAppSettings>): Promise<StoreSettings | WhatsAppSettings> {
    const response = await this.client.put<ApiResponse<StoreSettings | WhatsAppSettings>>(`/settings/${key}/update`, updates);
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

  // ==================== NOTIFICATIONS ====================
  async sendBroadcast(
    phones: string[],
    templateName: string,
    params: string[]
  ): Promise<{ queued: number; skipped: number }> {
    const response = await this.client.post<ApiResponse<{ queued: number; skipped: number }>>('/notifications/broadcast', {
      phones,
      templateName,
      params,
    });
    return response.data.data;
  }

  // ==================== SHIPROCKET ====================
  async createShipment(orderId: string): Promise<ShipmentResponse> {
    const response = await this.client.post<ApiResponse<ShipmentResponse>>(
      `/shiprocket/orders/${orderId}/ship`
    );
    return response.data.data;
  }

  async trackShipment(awbNumber: string): Promise<TrackingInfo> {
    const response = await this.client.get<ApiResponse<TrackingInfo>>(`/shiprocket/track/${awbNumber}`);
    return response.data.data;
  }

  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
    cod: boolean = false
  ): Promise<ShippingRate[]> {
    const response = await this.client.post<ApiResponse<ShippingRate[]>>('/shiprocket/rates', {
      pickupPincode,
      deliveryPincode,
      weight,
      cod,
    });
    return response.data.data;
  }
}

export const api = new ApiClient();
