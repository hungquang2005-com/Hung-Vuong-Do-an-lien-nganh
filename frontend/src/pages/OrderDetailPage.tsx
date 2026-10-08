// file là trang orderdetail của giao diện người dùng.
import { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, PackageCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatVnd, imageUrl } from '../api/client';
import { orderApi } from '../api/services';
import type { Order } from '../api/types';

const labels: Record<Order['status'], string> = {
  PENDING: 'Chờ xử lý',
  CONFIRMED: 'Đã xác nhận',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
};

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => { if (id) orderApi.detail(Number(id)).then(r => setOrder(r.data)); }, [id]);
  if (!order) return <div className="loading-page">Đang tải đơn hàng...</div>;
  return <section className="section order-detail"><div className="container"><Link to="/orders" className="text-link"><ArrowLeft size={16} /> Quay lại</Link><div className="section-heading"><div><div className="eyebrow">ORDER #{order.id}</div><h1>Chi tiết đơn hàng</h1></div><span className={`status-badge status-${order.status.toLowerCase()}`}>{labels[order.status]}</span></div><div className="detail-grid"><div className="card"><h3>Sản phẩm</h3>{order.items.map(item => <div className="product-row" key={item.id}><img src={imageUrl(item.productImage)} alt={item.productName} /><div className="product-info"><h3>{item.productName}</h3><span>{formatVnd(item.price)} × {item.quantity}</span></div><strong>{formatVnd(item.subtotal)}</strong></div>)}<div className="order-price-breakdown"><div><span>Tạm tính</span><strong>{formatVnd(order.subtotalAmount || order.totalAmount)}</strong></div>{order.discountAmount > 0 && <div><span>Voucher {order.couponCode}</span><strong>−{formatVnd(order.discountAmount)}</strong></div>}<div className="order-final-total"><span>Thành tiền</span><strong>{formatVnd(order.totalAmount)}</strong></div></div></div><div className="card"><h3><MapPin size={17} /> Thông tin nhận hàng</h3><p><b>{order.fullName}</b></p><p>{order.phone} • {order.email}</p><p>{order.address}</p><p>Thanh toán: {order.paymentMethod}</p><p>Trạng thái thanh toán: {order.paymentStatus}</p>{order.note && <p>Ghi chú: {order.note}</p>}<div className="review-band compact"><PackageCheck size={20} /> Đơn hàng đang được xử lý theo trạng thái hiện tại.</div></div></div></div></section>;
}
