import { useCallback, useEffect, useRef, useState } from 'react';
import { formatVnd } from '../../api/client';
import { orderApi } from '../../api/services';
import type { Order } from '../../api/types';

export function OrdersAdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const seenOrderIds = useRef<Set<number> | null>(null);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const { data } = await orderApi.adminList();
      if (seenOrderIds.current) {
        const newOrders = data.filter((order) => !seenOrderIds.current?.has(order.id));
        if (newOrders.length) {
          const newest = newOrders[0];
          window.dispatchEvent(new CustomEvent('toast', {
            detail: `Đơn hàng mới #${newest.id} từ ${newest.fullName} đang chờ xác nhận.`,
          }));
        }
      }
      seenOrderIds.current = new Set(data.map((order) => order.id));
      setOrders(data);
      setLastUpdated(new Date());
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void load().catch(() => {});
    };
    void load().catch(() => {});
    const interval = window.setInterval(() => void load().catch(() => {}), 5000);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [load]);

  const change = async (order: Order, status: Order['status']) => {
    await orderApi.adminUpdateStatus(order.id, status);
    await load();
  };

  return <div className="admin-page-shell">
    <div className="admin-page-header orders-admin-header">
      <div>
        <div className="eyebrow">ORDERS</div>
        <h1>Đơn hàng</h1>
        <p>{orders.length} đơn hàng trong hệ thống.</p>
      </div>
      <div className="orders-live-status" role="status">
        <span className="orders-live-dot" />
        <span>Tự động cập nhật mỗi 5 giây</span>
        {lastUpdated && <small>Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN')}</small>}
      </div>
    </div>
    <div className="admin-panel">
      <table className="admin-table">
        <thead><tr><th>Đơn</th><th>Khách</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Ngày</th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id}>
          <td><b>#{order.id}</b><div style={{ color: '#4d6b4d', fontSize: '.72rem' }}>{order.phone}</div></td>
          <td>{order.fullName}<div style={{ color: '#4d6b4d', fontSize: '.72rem' }}>{order.address}</div></td>
          <td>{formatVnd(order.totalAmount)}</td>
          <td>{order.paymentMethod} / {order.paymentStatus}</td>
          <td><select className="admin-select" value={order.status} onChange={(event) => change(order, event.target.value as Order['status'])}>{['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}</select></td>
          <td>{new Date(order.createdAt).toLocaleString('vi-VN')}</td>
        </tr>)}</tbody>
      </table>
      {!orders.length && <div className="admin-empty">Chưa có đơn hàng.</div>}
    </div>
  </div>;
}
