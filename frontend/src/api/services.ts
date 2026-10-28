// file tập trung các hàm gọi api cho các chức năng của ứng dụng.
import { api } from './client';
import { readChatStream } from './chat-stream';
import type { OwnReview, ReviewPage, ReviewSummary } from './types';
import type { Cart, ChatCheckoutQuote, ChatRequestOptions, ChatResponse, ContactMessage, Coupon, DashboardData, Favorite, Order, OrderInput, Product, PromotionEvent, PromotionInput, User, UserAddress } from './types';

export const authApi = {
  login: (data: { usernameOrEmail: string; password: string }) => api.post<{ accessToken: string; user: User }>('/auth/login', data),
  register: (data: { fullName: string; username: string; email: string; password: string; phone?: string }) => api.post<{ accessToken: string; user: User }>('/auth/register', data),
  forgotPassword: (email: string) => api.post<{ message: string; expiresAt: string }>('/auth/forgot-password', { email }),
  verifyResetOtp: (email: string, otp: string) => api.post<{ message: string }>('/auth/verify-reset-otp', { email, otp }),
  resetPassword: (email: string, otp: string, newPassword: string) => api.post<{ message: string }>('/auth/reset-password', { email, otp, newPassword }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword, confirmPassword }),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (data: Pick<User, 'fullName' | 'phone' | 'birthDate' | 'gender'> & { address?: string | null }) => api.patch<User>('/auth/me', data),
  updateCardProfile: (data: { holder: string; type: 'DOMESTIC' | 'INTERNATIONAL'; provider: string; last4: string; expMonth: number; expYear: number; pin?: string }) => api.patch<User>('/auth/me/card', data),
  updateAvatar: (form: FormData) => api.post<User>('/auth/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const productApi = {
  list: (params?: { keyword?: string; category?: string }) => api.get<Product[]>('/products', { params }),
  featured: () => api.get<Product[]>('/products/featured'),
  categories: () => api.get<string[]>('/products/categories/list'),
  detail: (id: number) => api.get<Product>(`/products/${id}`),
  create: (form: FormData) => api.post<Product>('/products', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id: number, form: FormData) => api.patch<Product>(`/products/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove: (id: number) => api.delete(`/products/${id}`),
};

export const promotionApi = {
  current: (signal?: AbortSignal) => api.get<{ serverTime: string; event: PromotionEvent | null }>('/promotions/current', { signal }),
  list: () => api.get<{ serverTime: string; events: PromotionEvent[] }>('/promotions/admin'),
  create: (data: PromotionInput) => api.post<PromotionEvent>('/promotions', data),
  update: (id: number, data: PromotionInput) => api.patch<PromotionEvent>(`/promotions/${id}`, data),
};

export const reviewApi = {
  list: (productId: number, params: { page: number; rating?: number }, signal?: AbortSignal) => api.get<ReviewPage>(`/products/${productId}/reviews`, { params, signal }),
  mine: (productId: number, signal?: AbortSignal) => api.get<OwnReview>(`/products/${productId}/reviews/mine`, { signal }),
  save: (productId: number, data: { rating: number; comment: string }) => api.put<OwnReview & { summary: ReviewSummary }>(`/products/${productId}/reviews`, data),
};

export const chatApi = {
  send: (message: string, sessionId?: string, options?: ChatRequestOptions) => api.post<ChatResponse>('/chat', { message, sessionId, ...options }, { timeout: 20_000 }),
  async stream(message: string, sessionId: string, options: ChatRequestOptions, onDelta: (text: string) => void, signal: AbortSignal) {
    const token = localStorage.getItem('giadung_token');
    const response = await fetch(api.getUri({ url: '/chat' }), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, sessionId, ...options }), signal: AbortSignal.any([signal, AbortSignal.timeout(!options.action || options.action.startsWith('checkout_') ? 45_000 : 20_000)]),
    });
    return readChatStream(response, onDelta);
  },
};

export const cartApi = {
  get: () => api.get<Cart>('/cart'),
  add: (productId: number, quantity: number) => api.post<Cart>('/cart/add', { productId, quantity }),
  update: (productId: number, quantity: number) => api.put<Cart>('/cart/update', { productId, quantity }),
  remove: (productId: number) => api.delete<Cart>(`/cart/remove/${productId}`),
  clear: () => api.delete<Cart>('/cart/clear'),
};

export const orderApi = {
  preview: (data: OrderInput) => api.post<ChatCheckoutQuote>('/orders/preview', data),
  create: (data: OrderInput) => api.post<Order>('/orders', data),
  list: () => api.get<Order[]>('/orders'),
  detail: (id: number) => api.get<Order>(`/orders/${id}`),
  adminList: () => api.get<Order[]>('/admin/orders'),
  adminUpdateStatus: (id: number, status: Order['status']) => api.patch<Order>(`/admin/orders/${id}/status`, { status }),
  dashboard: () => api.get<DashboardData>('/admin/dashboard'),
  revenue: () => api.get<Array<{ period: string; orders: number; revenue: number }>>('/admin/revenue'),
  users: () => api.get<User[]>('/admin/users'),
};

export const favoriteApi = {
  list: () => api.get<Favorite[]>('/favorites'),
  add: (productId: number) => api.post<Favorite>(`/favorites/${productId}`),
  remove: (productId: number) => api.delete(`/favorites/${productId}`),
};

export const addressApi = {
  list: () => api.get<UserAddress[]>('/addresses'),
  create: (data: Pick<UserAddress, 'fullName' | 'phone' | 'address' | 'isDefault'>) => api.post<UserAddress>('/addresses', data),
  update: (id: number, data: Partial<Pick<UserAddress, 'fullName' | 'phone' | 'address' | 'isDefault'>>) => api.patch<UserAddress>(`/addresses/${id}`, data),
};

export const couponApi = {
  list: () => api.get<Coupon[]>('/coupons'),
  adminList: () => api.get<Coupon[]>('/coupons/admin/list'),
  validate: (code: string, orderAmount: number, productId?: number) => api.post<{ valid: boolean; coupon: Coupon; discountAmount: number; finalAmount: number }>('/coupons/validate', { code, orderAmount, productId }),
  create: (data: Partial<Coupon>) => api.post<Coupon>('/coupons', data),
  update: (id: number, data: Partial<Coupon>) => api.patch<Coupon>(`/coupons/${id}`, data),
  remove: (id: number) => api.delete(`/coupons/${id}`),
};

export const paymentApi = {
  createPayOSPaymentLink: (orderId: number) => api.post<{ checkoutUrl: string }>(`/payment/payos/create-link/${orderId}`),
  confirmCardPayment: (orderId: number, pin: string) => api.post<{ success: boolean; simulated: boolean }>(`/payment/card/confirm/${orderId}`, { pin }),
};

export const contactApi = {
  create: (data: { name: string; email: string; phone?: string; message: string }) => api.post('/contact', data),
  adminList: () => api.get<ContactMessage[]>('/contact/admin'),
  read: (id: number) => api.post(`/contact/admin/${id}/read`),
  remove: (id: number) => api.delete(`/contact/admin/${id}`),
};

