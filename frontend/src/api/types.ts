// file định nghĩa các kiểu dữ liệu typescript dùng khi làm việc với api.

export interface DashboardData {
  revenue: number;
  orders: number;
  pendingOrders: number;
  users: number;
  products: number;
  recentOrders: Order[];
  chartRevenueByDay: Array<{ day: string; value: number }>;
  chartOrdersByDay: Array<{ day: string; value: number }>;
}
export type Role = 'USER' | 'ADMIN';

export interface User {
  id: number;
  fullName: string;
  username: string | null;
  email: string;
  phone: string | null;
  role: Role;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  specifications: string | null;
  origin: string | null;
  price: number;
  stock: number;
  category: string | null;
  brand: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
}

export interface Favorite {
  id: number;
  productId: number;
  createdAt: string;
  product: Product;
}

export interface UserAddress {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  address: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CouponDiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number | string;
  minOrderAmount: number | string;
  maxDiscountAmount: number | string | null;
  usageLimit: number | null;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: number;
  productId: number;
  quantity: number;
  subtotal: number;
  product: Pick<Product, 'id' | 'name' | 'price' | 'stock' | 'imageUrl' | 'category' | 'brand'>;
}

export interface Cart {
  id: number;
  items: CartItem[];
  itemCount: number;
  total: number;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'QR' | 'CARD' | 'CASH' | 'PAYOS';

export interface OrderItem {
  id: number;
  productId: number | null;
  productName: string;
  productImage: string | null;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  totalAmount: number;
  subtotalAmount: number;
  discountAmount: number;
  couponCode: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: 'UNPAID' | 'PAID';
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ChatResponse {
  message: string;
  source: 'knowledge' | 'gemini' | 'product';
  knowledgeId?: number;
}

export type KnowledgeStatus = 'pending' | 'approved' | 'rejected';

export interface ChatbotKnowledge {
  id: number;
  question: string;
  answer: string;
  keywords: string;
  contextHash: string;
  status: KnowledgeStatus;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotStats {
  since: string;
  totalQuestions: number;
  knowledgeHits: number;
  geminiCalls: number;
  productQueries: number;
  knowledgeHitRate: number;
  errors: number;
  pendingSaveFailures: number;
}
