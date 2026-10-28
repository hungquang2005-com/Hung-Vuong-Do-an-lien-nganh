// file định nghĩa layout admin dùng để tạo khung giao diện chung cho các trang.
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, Boxes, FileText, LayoutDashboard, LogOut, Mail, ShoppingBag, Ticket, Users, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user || user.role !== 'ADMIN') return null;
  const nav = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/products', label: 'Sản phẩm', icon: Boxes },
    { to: '/admin/orders', label: 'Đơn hàng', icon: ShoppingBag },
    { to: '/admin/coupons', label: 'Thẻ giảm giá', icon: Ticket },
    { to: '/admin/promotions', label: 'Sự kiện ưu đãi', icon: Zap },
    { to: '/admin/revenue', label: 'Doanh thu', icon: BarChart3 },
    { to: '/admin/users', label: 'Người dùng', icon: Users },
    { to: '/admin/messages', label: 'Tin nhắn', icon: Mail },
    { to: '/admin/chatbot/knowledge', label: 'Chatbot Knowledge', icon: BookOpen },
  ];

  return <div className="admin-app">
    <header className="admin-navbar"><div className="admin-navbar-inner"><div className="admin-logo"><Link to="/admin">Gia dụng Việt <small>QUẢN TRỊ</small></Link></div><nav className="admin-nav-menu" aria-label="Điều hướng quản trị">{nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className="admin-nav-link"><Icon size={16} />{label}</NavLink>)}</nav><div className="admin-nav-right"><ThemeToggle /><span className="admin-user">{user.username || user.email}</span><button className="admin-nav-logout" onClick={() => { logout(); navigate('/login'); }}><LogOut size={15} />Đăng xuất</button></div></div></header>
    {location.pathname !== '/admin' && <div className="admin-breadcrumb"><FileText size={14} /> Quản trị / {location.pathname.split('/').filter(Boolean).slice(1).join(' / ')}</div>}
    <main className="admin-page"><Outlet /></main>
  </div>;
}
