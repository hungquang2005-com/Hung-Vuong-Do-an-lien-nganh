// file tập trung các hàm gọi api cho các chức năng của ứng dụng.
import { api } from './client';
import type { Cart, ChatResponse, ContactMessage, Coupon, DashboardData, Favorite, Order, Product, User, UserAddress } from './types';

export const authApi = {
  login: (data: { usernameOrEmail: string; password: string }) => api.post<{ accessToken: string; user: User }>('/auth/login', data),
  register: (data: { fullName: string; username: string; email: string; password: string; phone?: string }) => api.post<{ accessToken: string; user: User }>('/auth/register', data),
  forgotPassword: (email: string) => api.post<{ message: string; expiresAt: string }>('/auth/forgot-password', { email }),
  verifyResetOtp: (email: string, otp: string) => api.post<{ message: string }>('/auth/verify-reset-otp', { email, otp }),
  resetPassword: (email: string, otp: string, newPassword: string) => api.post<{ message: string }>('/auth/reset-password', { email, otp, newPassword }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword, confirmPassword }),
  me: () => api.get<User>('/auth/me'),
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

export const chatApi = {
  send: (message: string) => api.post<ChatResponse>('/chat', { message }, { timeout: 20_000 }),
};

export const cartApi = {
  get: () => api.get<Cart>('/cart'),
  add: (productId: number, quantity: number) => api.post<Cart>('/cart/add', { productId, quantity }),
  update: (productId: number, quantity: number) => api.put<Cart>('/cart/update', { productId, quantity }),
  remove: (productId: number) => api.delete<Cart>(`/cart/remove/${productId}`),
  clear: () => api.delete<Cart>('/cart/clear'),
};

export const orderApi = {
  create: (data: { fullName: string; email: string; phone: string; address: string; paymentMethod: string; note?: string; couponCode?: string }) => api.post<Order>('/orders', data),
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
};

export const couponApi = {
  list: () => api.get<Coupon[]>('/coupons'),
  validate: (code: string, orderAmount: number) => api.post<{ valid: boolean; coupon: Coupon; discountAmount: number; finalAmount: number }>('/coupons/validate', { code, orderAmount }),
};

export const paymentApi = {
  createPayOSPaymentLink: (orderId: number) => api.post<{ checkoutUrl: string }>(`/payment/payos/create-link/${orderId}`),
};

export const contactApi = {
  create: (data: { name: string; email: string; phone?: string; message: string }) => api.post('/contact', data),
  adminList: () => api.get<ContactMessage[]>('/contact/admin'),
  read: (id: number) => api.post(`/contact/admin/${id}/read`),
  remove: (id: number) => api.delete(`/contact/admin/${id}`),
};

