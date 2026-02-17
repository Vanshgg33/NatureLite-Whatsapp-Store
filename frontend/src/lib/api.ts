import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
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
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.clearToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  private setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  private clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  // ==================== AUTH ====================
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/admin/login', {
      email,
      password,
    });
    const data = response.data.data;
    this.setToken(data.accessToken);
    return data;
  }

  async register(name: string, email: string, password: string, phone?: string): Promise<AuthResponse> {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/auth/admin/register', {
      name,
      email,
      password,
      phone,
    });
    const data = response.data.data;
    this.setToken(data.accessToken);
    return data;
  }

  logout(): void {
    this.clearToken();
  }

  async getProfile(): Promise<User> {
    const response = await this.client.get<ApiResponse<User>>('/auth/profile');
    return response.data.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/change-password', { currentPassword, newPassword });
  }

  // ==================== ANALYTICS ====================
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.client.get<ApiResponse<DashboardStats>>('/analytics/dashboard');
    return response.data.data;
  }

  async getRevenueByDay(days: number = 30): Promise<Array<{ date: string; revenue: number; orders: number }>> {
    const response = await this.client.get<ApiResponse<Array<{ date: string; revenue: number; orders: number }>>>(
      `/analytics/revenue?days=${days}`
    );
    return response.data.data;
  }

  async getOrderAnalytics(startDate: string, endDate: string): Promise<Record<string, unknown>> {
    const response = await this.client.get<ApiResponse<Record<string, unknown>>>(
      `/analytics/orders?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data.data;
  }

  async getCustomerAnalytics(startDate: string, endDate: string): Promise<Record<string, unknown>> {
    const response = await this.client.get<ApiResponse<Record<string, unknown>>>(
      `/analytics/customers?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data.data;
  }

  async getProductAnalytics(startDate: string, endDate: string): Promise<Record<string, unknown>> {
    const response = await this.client.get<ApiResponse<Record<string, unknown>>>(
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

  async getOrderStats(startDate?: string, endDate?: string): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const response = await this.client.get<ApiResponse<Record<string, unknown>>>(`/orders/stats?${params}`);
    return response.data.data;
  }

  async getOrdersByStatus(): Promise<Record<string, number>> {
    const response = await this.client.get<ApiResponse<Record<string, number>>>('/orders/by-status');
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
    userId: string,
    productIds?: string[],
    categoryIds?: string[]
  ): Promise<{ valid: boolean; discount?: number; message?: string }> {
    const response = await this.client.post<ApiResponse<{ valid: boolean; discount?: number; message?: string }>>(
      '/coupons/validate',
      { code, orderAmount, userId, productIds, categoryIds }
    );
    return response.data.data;
  }

  // ==================== SETTINGS ====================
  async getSettings(): Promise<Record<string, Record<string, unknown>>> {
    const response = await this.client.get<ApiResponse<Record<string, Record<string, unknown>>>>('/settings');
    return response.data.data;
  }

  async getPublicSettings(): Promise<Record<string, Record<string, unknown>>> {
    const response = await this.client.get<ApiResponse<Record<string, Record<string, unknown>>>>('/settings/public');
    return response.data.data;
  }

  async getSetting(key: string): Promise<Record<string, unknown> | null> {
    const response = await this.client.get<ApiResponse<Record<string, unknown> | null>>(`/settings/${key}`);
    return response.data.data;
  }

  async updateSettings(key: string, updates: Record<string, unknown>): Promise<unknown> {
    const response = await this.client.put<ApiResponse<unknown>>(`/settings/${key}/update`, updates);
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

  async getWhatsAppMessages(phone: string, limit: number = 50): Promise<unknown[]> {
    const response = await this.client.get<ApiResponse<unknown[]>>(`/whatsapp/messages/${phone}?limit=${limit}`);
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
  async createShipment(orderId: string): Promise<{ success: boolean; data?: unknown }> {
    const response = await this.client.post<ApiResponse<{ success: boolean; data?: unknown }>>(
      `/shiprocket/orders/${orderId}/ship`
    );
    return response.data.data;
  }

  async trackShipment(awbNumber: string): Promise<unknown> {
    const response = await this.client.get<ApiResponse<unknown>>(`/shiprocket/track/${awbNumber}`);
    return response.data.data;
  }

  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
    cod: boolean = false
  ): Promise<unknown[]> {
    const response = await this.client.post<ApiResponse<unknown[]>>('/shiprocket/rates', {
      pickupPincode,
      deliveryPincode,
      weight,
      cod,
    });
    return response.data.data;
  }
}

export const api = new ApiClient();
