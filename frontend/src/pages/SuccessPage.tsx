// file là trang success của giao diện người dùng.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orderApi } from '../api/services';
import type { Order } from '../api/types';

export function SuccessPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = Number(orderId);
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const loadOrder = async () => {
      try {
        let currentOrder: Order | null = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const response = await orderApi.detail(id);
          currentOrder = response.data;
          if (cancelled) return;
          setOrder(currentOrder);
          const usesOnlinePayment = currentOrder.paymentMethod === 'QR' || currentOrder.paymentMethod === 'PAYOS';
          if (!usesOnlinePayment || currentOrder.paymentStatus === 'PAID' || attempt === 7) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }

        if (!cancelled && currentOrder) {
          const paid = currentOrder.paymentStatus === 'PAID';
          const usesOnlinePayment = currentOrder.paymentMethod === 'QR' || currentOrder.paymentMethod === 'PAYOS';
          const message = paid
            ? `Thanh toán thành công! Mã đơn #${id}`
            : usesOnlinePayment
              ? `Đơn hàng #${id} đã tạo, đang chờ xác nhận thanh toán.`
              : `Đặt hàng thành công! Mã đơn #${id}. Thanh toán khi nhận hàng.`;
          window.dispatchEvent(new CustomEvent('toast', { detail: message }));
        }
      } catch {
        if (!cancelled) setOrder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadOrder();
    return () => { cancelled = true; };
  }, [orderId]);

  const isPaid = order?.paymentStatus === 'PAID';
  const isCash = order?.paymentMethod === 'CASH';
  const heading = isPaid ? 'Thanh toán thành công!' : 'Đặt hàng thành công!';
  const description = isPaid
    ? 'Cảm ơn bạn đã thanh toán. Đơn hàng của bạn đang được xử lý.'
    : isCash
      ? 'Cảm ơn bạn đã đặt hàng. Bạn sẽ thanh toán cho nhân viên giao hàng khi nhận sản phẩm.'
      : 'Đơn hàng đã được tạo. Hệ thống đang xác nhận trạng thái thanh toán của bạn.';
  const paymentText = loading
    ? 'Đang kiểm tra thanh toán'
    : isPaid
      ? 'Thanh toán thành công'
      : isCash
        ? 'Thanh toán khi nhận hàng'
        : 'Chưa xác nhận thanh toán';

  return <div className="success-container">
    <div className="success-box">
      <div className="success-icon"><i className="fa-solid fa-check-circle" /></div>
      <h1 className="success-title">{loading ? 'Đang xác nhận đơn hàng…' : heading}</h1>
      <p className="success-desc">{loading ? 'Đang kiểm tra trạng thái thanh toán của bạn.' : description}</p>
      <div className="order-info">
        <div className="info-row">
          <Info label="Mã đơn hàng" value={`#${order?.id || orderId || ''}`} highlight />
          <Info label="Trạng thái" value={loading ? 'Đang tải' : order?.status || 'Không tìm thấy'} />
        </div>
        <div className="info-row">
          <Info label="Phương thức" value={order?.paymentMethod || '--'} />
          <Info label="Thanh toán" value={loading ? 'Đang tải' : paymentText} />
        </div>
      </div>
      <div className="actions">
        <Link to={`/orders/${orderId}`} className="btn-action btn-primary-action"><i className="fa-solid fa-receipt" /> Xem đơn hàng</Link>
        <Link to="/products" className="btn-action btn-secondary-action"><i className="fa-solid fa-bag-shopping" /> Tiếp tục mua sắm</Link>
      </div>
    </div>
  </div>;
}

function Info({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className="info-item"><div className="info-label">{label}</div><div className={`info-value ${highlight ? 'highlight' : ''}`}>{value}</div></div>;
}
