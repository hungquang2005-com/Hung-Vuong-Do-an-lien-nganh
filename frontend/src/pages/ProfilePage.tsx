import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import type { ChangeEvent } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import { formatVnd, imageUrl } from '../api/client';
import { addressApi, authApi, couponApi, favoriteApi, orderApi } from '../api/services';
import type { Coupon, Favorite, Gender, Order, UserAddress } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: Gender;
  address: string;
};
type CardProfileForm = {
  holder: string;
  type: 'DOMESTIC' | 'INTERNATIONAL';
  provider: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  pin: string;
  confirmPin: string;
};
type CouponCard = Pick<Coupon, 'code' | 'description' | 'discountType' | 'discountValue' | 'minOrderAmount'> & {
  id: number | string;
  endDate?: string;
  freeShipping?: boolean;
};

const statusLabels: Record<Order['status'], string> = {
  PENDING: 'Chờ xử lý',
  CONFIRMED: 'Đã xác nhận',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
};

const emptyForm: ProfileForm = {
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: 'male',
  address: '',
};
const emptyCardForm: CardProfileForm = {
  holder: '', type: 'DOMESTIC', provider: 'NAPAS', cardNumber: '', expMonth: '', expYear: '', pin: '', confirmPin: '',
};

function couponValue(coupon: CouponCard) {
  const value = Number(coupon.discountValue);
  return coupon.discountType === 'percentage' ? `${value}%` : formatVnd(value);
}

function toast(message: string) {
  window.dispatchEvent(new CustomEvent('toast', { detail: message }));
}

function apiError(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : fallback;
}

export function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [cardForm, setCardForm] = useState<CardProfileForm>(emptyCardForm);
  const [cardBusy, setCardBusy] = useState(false);
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mapAddress, setMapAddress] = useState('');

  const defaultAddress = useMemo(() => addresses.find(a => a.isDefault) || addresses[0], [addresses]);
  const activeCoupons = useMemo(() => coupons
    .filter(c => c.isActive && new Date(c.endDate).getTime() >= Date.now()), [coupons]);
  const couponCards: CouponCard[] = activeCoupons;
  const visibleFavorites = showAllFavorites ? favorites : favorites.slice(0, 2);
  const visibleCoupons = showAllCoupons ? couponCards : couponCards.slice(0, 2);
  const avatar = avatarPreview || (user?.avatarUrl ? imageUrl(user.avatarUrl) : 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=320&q=80');

  useEffect(() => {
    if (!user || editing) return;
    setForm({
      fullName: user.fullName || user.username || '',
      email: user.email,
      phone: user.phone || '',
      birthDate: user.birthDate?.slice(0, 10) || '',
      gender: user.gender || 'male',
      address: defaultAddress?.address || user.address || '',
    });
  }, [user, defaultAddress?.address, editing]);

  useEffect(() => {
    const card = user?.savedCard;
    if (!card) return;
    setCardForm(current => ({
      ...current,
      holder: card.holder,
      type: card.type,
      provider: card.provider,
      last4: card.last4,
      expMonth: String(card.expMonth),
      expYear: String(card.expYear),
      pin: '',
      confirmPin: '',
    }));
  }, [user?.savedCard]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMapAddress(form.address.trim()), 700);
    return () => window.clearTimeout(timer);
  }, [form.address]);

  useEffect(() => {
    let live = true;
    const refreshFavorites = () => favoriteApi.list().then(r => live && setFavorites(r.data)).catch(() => {});
    orderApi.list().then(r => live && setOrders(r.data)).catch(() => live && setOrders([]));
    refreshFavorites();
    window.addEventListener('favorite-changed', refreshFavorites);
    const refreshAddresses = () => addressApi.list().then(r => live && setAddresses(r.data)).catch(() => {});
    refreshAddresses();
    window.addEventListener('addresses-changed', refreshAddresses);
    couponApi.list().then(r => live && setCoupons(r.data)).catch(() => live && setCoupons([]));
    return () => { live = false; window.removeEventListener('favorite-changed', refreshFavorites); window.removeEventListener('addresses-changed', refreshAddresses); };
  }, [user?.id]);

  if (!user) return null;

  const recentOrders = orders.slice(0, 4);
  const displayName = form.fullName || user.fullName || user.username || 'Khách hàng';
  const orderItems = orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0);

  const update = (key: keyof ProfileForm, value: string) => {
    setEditing(true);
    setForm(current => ({ ...current, [key]: value }));
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();
    if (!fullName) return toast('Họ và tên không được để trống');
    if (address !== (defaultAddress?.address || '') && (!address || !phone)) {
      return toast(!address ? 'Địa chỉ không được để trống' : 'Cần số điện thoại để lưu địa chỉ');
    }

    setSaving(true);
    try {
      await authApi.updateProfile({
        fullName,
        phone: phone || null,
        birthDate: form.birthDate || null,
        gender: form.gender,
        address,
      });
      await refresh();
    } catch (error) {
      toast(apiError(error, 'Không thể lưu hồ sơ. Vui lòng thử lại.'));
      setSaving(false);
      return;
    }

    try {
      if (address !== (defaultAddress?.address || '')) {
        const response = defaultAddress
          ? await addressApi.update(defaultAddress.id, { address, isDefault: true })
          : await addressApi.create({ fullName, phone, address, isDefault: true });
        setAddresses(current => defaultAddress
          ? current.map(item => item.id === response.data.id ? response.data : { ...item, isDefault: false })
          : [response.data, ...current]);
      }
      setEditing(false);
      toast('Đã lưu hồ sơ thành công');
    } catch (error) {
      toast(`Hồ sơ đã lưu nhưng địa chỉ chưa được cập nhật: ${apiError(error, 'Vui lòng thử lại.')}`);
    } finally {
      setSaving(false);
    }
  };
  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Chỉ chọn tệp hình ảnh.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Ảnh đại diện tối đa 5 MB.'); return; }
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    setAvatarBusy(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      await authApi.updateAvatar(body);
      await refresh();
      setAvatarPreview('');
      toast('Đã cập nhật ảnh đại diện.');
    } catch {
      setAvatarPreview('');
      toast('Không thể cập nhật ảnh đại diện. Vui lòng thử lại.');
    } finally {
      URL.revokeObjectURL(preview);
      setAvatarBusy(false);
    }
  };
  const updateCardField = (key: keyof CardProfileForm, value: string) => setCardForm(current => ({ ...current, [key]: value }));
  const saveCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{16,19}$/.test(cardForm.cardNumber)) { toast('Vui lòng nhập số thẻ gồm 16–19 chữ số.'); return; }
    if (cardForm.pin && cardForm.pin !== cardForm.confirmPin) { toast('PIN xác nhận chưa khớp.'); return; }
    setCardBusy(true);
    try {
      await authApi.updateCardProfile({
        holder: cardForm.holder,
        type: cardForm.type,
        provider: cardForm.provider,
        last4: cardForm.cardNumber.slice(-4),
        expMonth: Number(cardForm.expMonth),
        expYear: Number(cardForm.expYear),
        ...(cardForm.pin ? { pin: cardForm.pin } : {}),
      });
      await refresh();
      setCardForm(current => ({ ...current, cardNumber: '', pin: '', confirmPin: '' }));
      toast('Đã lưu thông tin thẻ mô phỏng.');
    } catch (error) {
      toast((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Không thể lưu thông tin thẻ. Vui lòng kiểm tra lại.');
    } finally { setCardBusy(false); }
  };

  return <section className="profile-shell">
    <aside className="profile-sidebar">
      <div className="profile-avatar-card">
        <img src={avatar} alt="Ảnh đại diện" />
        <strong>{displayName}</strong>
        <span>{user.email}</span>
        <label className="avatar-change-button">{avatarBusy ? 'Đang tải ảnh…' : 'Đổi ảnh đại diện'}<input type="file" accept="image/*" onChange={changeAvatar} disabled={avatarBusy} /></label>
      </div>
      <button type="button" className="profile-menu-toggle" aria-expanded={menuOpen} aria-controls="profile-navigation" onClick={() => setMenuOpen(value => !value)}>
        Menu tài khoản <ChevronDown size={18} aria-hidden="true" />
      </button>
      <nav id="profile-navigation" aria-label="Tài khoản cá nhân" className={`profile-menu ${menuOpen ? 'is-open' : ''}`}>
        <a href="#profile-info" className="active"><i className="fa-solid fa-id-card" /> Hồ sơ cá nhân</a>
        <a href="#profile-card"><i className="fa-solid fa-credit-card" /> Thẻ thanh toán</a>
        <Link to="/orders"><i className="fa-solid fa-receipt" /> Đơn hàng của tôi</Link>
        <a href="#profile-addresses"><i className="fa-solid fa-location-dot" /> Địa chỉ giao hàng</a>
        <a href="#profile-coupons"><i className="fa-solid fa-ticket" /> Mã giảm giá</a>
        <a href="#profile-favorites"><i className="fa-solid fa-heart" /> Sản phẩm yêu thích</a>
        <Link to="/change-password"><i className="fa-solid fa-lock" /> Đổi mật khẩu</Link>
        <button type="button" onClick={logout}><i className="fa-solid fa-right-from-bracket" /> Đăng xuất</button>
      </nav>
    </aside>

    <div className="profile-main">
      <form className="profile-panel profile-info-panel" id="profile-info" onSubmit={save}>
        <div className="profile-panel-head">
          <div>
            <h1>Hồ sơ cá nhân</h1>
            <p>Quản lý thông tin tài khoản và cập nhật địa chỉ nhận hàng.</p>
          </div>
          {!editing ? (
            <button type="button" className="profile-mini-btn" onClick={() => setEditing(true)}>
              <i className="fa-solid fa-pen" /> Chỉnh sửa
            </button>
          ) : (
            <button type="submit" className="profile-mini-btn primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          )}
        </div>

        <div className="profile-form-grid">
          <div className="profile-photo">
            <img src={avatar} alt="Ảnh đại diện" />
            <span>Ảnh đại diện</span>
          </div>
          <label>Họ và tên
            <input autoComplete="name" value={form.fullName} onChange={e => update('fullName', e.target.value)} disabled={saving} />
          </label>
          <label>Email (không thể thay đổi)
            <input value={form.email} readOnly />
          </label>
          <label>Số điện thoại
            <input type="tel" autoComplete="tel" value={form.phone} onChange={e => update('phone', e.target.value)} disabled={saving} />
          </label>
          <label>Ngày sinh
            <input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} disabled={saving} />
          </label>
          <fieldset className="profile-gender">
            <legend>Giới tính</legend>
            {[
              ['male', 'Nam'],
              ['female', 'Nữ'],
              ['other', 'Khác'],
            ].map(([value, label]) => <label key={value}>
              <input type="radio" name="gender" value={value} checked={form.gender === value} disabled={saving} onChange={e => update('gender', e.target.value)} />
              {label}
            </label>)}
          </fieldset>
          <label>Địa chỉ mặc định
            <textarea rows={2} autoComplete="street-address" value={form.address} onChange={e => update('address', e.target.value)} disabled={saving} />
          </label>
        </div>
        {editing && <button type="submit" className="profile-mobile-save profile-mini-btn primary" disabled={saving}><Save size={18} aria-hidden="true" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>}
      </form>

      <form className="profile-panel" id="profile-card" onSubmit={saveCard}>
        <div className="profile-panel-head">
          <div><h2>Thẻ thanh toán</h2><p>Lưu thông tin thẻ mô phỏng để dùng nhanh ở bước thanh toán.</p></div>
          <button type="submit" className="profile-mini-btn primary" disabled={cardBusy}><Save size={16} /> {cardBusy ? 'Đang lưu…' : 'Lưu thẻ'}</button>
        </div>
        <div className="card-demo-notice"><i className="fa-solid fa-shield-halved" /><div><strong>Chỉ dùng cho bản mô phỏng</strong><span>Nhập số thẻ mô phỏng gồm 16–19 chữ số. Hệ thống chỉ lưu 4 số cuối để hiển thị; số thẻ đầy đủ không được lưu. Không nhập thông tin thẻ thật hoặc CVV. PIN là PIN riêng của website, không phải PIN ngân hàng.</span></div></div>
        <div className="profile-form-grid">
          <label>Tên chủ thẻ
            <input autoComplete="off" required maxLength={100} value={cardForm.holder} onChange={e => updateCardField('holder', e.target.value)} placeholder="Ví dụ: NGUYEN VAN A" />
          </label>
          <label>Loại thẻ
            <select value={cardForm.type} onChange={e => { const type = e.target.value as CardProfileForm['type']; setCardForm(current => ({ ...current, type, provider: type === 'DOMESTIC' ? 'NAPAS' : 'VISA' })); }}>
              <option value="DOMESTIC">Thẻ nội địa</option><option value="INTERNATIONAL">Thẻ quốc tế</option>
            </select>
          </label>
          <label>Ngân hàng / tổ chức thẻ
            <select value={cardForm.provider} onChange={e => updateCardField('provider', e.target.value)}>
              {(cardForm.type === 'DOMESTIC' ? [['NAPAS','NAPAS'],['VIETCOMBANK','Vietcombank'],['BIDV','BIDV'],['TECHCOMBANK','Techcombank'],['MB','MB Bank'],['ACB','ACB']] : [['VISA','Visa'],['MASTERCARD','Mastercard'],['JCB','JCB'],['AMEX','American Express']]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Số thẻ (mô phỏng)
            <input type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{16,19}" minLength={16} maxLength={19} required value={cardForm.cardNumber} onChange={e => updateCardField('cardNumber', e.target.value.replace(/\D/g, '').slice(0, 19))} placeholder="Nhập 16–19 chữ số" />
          </label>
          <label>Tháng hết hạn
            <select required value={cardForm.expMonth} onChange={e => updateCardField('expMonth', e.target.value)}><option value="">Tháng</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select>
          </label>
          <label>Năm hết hạn
            <input type="number" min={new Date().getFullYear()} max="2100" required value={cardForm.expYear} onChange={e => updateCardField('expYear', e.target.value)} placeholder={String(new Date().getFullYear() + 3)} />
          </label>
          <label>PIN thanh toán 6 số {user.hasTransactionPin && <small>(để trống nếu giữ PIN cũ)</small>}
            <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required={!user.hasTransactionPin} value={cardForm.pin} onChange={e => updateCardField('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={user.hasTransactionPin ? 'Đã thiết lập' : 'Tạo PIN 6 chữ số'} />
          </label>
          {cardForm.pin && <label>Nhập lại PIN
            <input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={cardForm.confirmPin} onChange={e => updateCardField('confirmPin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Nhập lại PIN" />
          </label>}
        </div>
        {user.savedCard && <p className="profile-card-saved"><i className="fa-solid fa-circle-check" /> Đã lưu {user.savedCard.type === 'DOMESTIC' ? 'thẻ nội địa' : 'thẻ quốc tế'} {user.savedCard.provider} ·•••• {user.savedCard.last4}</p>}
      </form>

      <div className="profile-stats">
        <div><i className="fa-solid fa-box-open" /><strong>{orders.length}</strong><span>Đơn hàng</span></div>
        <div><i className="fa-solid fa-heart" /><strong>{favorites.length}</strong><span>Yêu thích</span></div>
        <div><i className="fa-solid fa-ticket" /><strong>{couponCards.length}</strong><span>Mã giảm giá</span></div>
        <div><i className="fa-solid fa-location-dot" /><strong>{addresses.length}</strong><span>Địa chỉ</span></div>
      </div>

      <div className="profile-content-grid">
        <section className="profile-panel profile-products" id="profile-favorites">
          <div className="profile-section-head">
            <h2>Sản phẩm yêu thích</h2>
            {favorites.length > 2 && <button type="button" className="profile-link-button" onClick={() => setShowAllFavorites(value => !value)}>{showAllFavorites ? 'Thu gọn' : `Xem tất cả (${favorites.length})`} <i className={`fa-solid ${showAllFavorites ? 'fa-angle-up' : 'fa-angle-right'}`} /></button>}
          </div>
          {favorites.length ? (
            <div className="product-grid profile-favorites-grid">
              {visibleFavorites.map((favorite, index) => <ProductCard key={favorite.id} product={favorite.product} home index={index} />)}
            </div>
          ) : (
            <div className="profile-empty"><i className="fa-solid fa-heart" /> Chưa có sản phẩm yêu thích.</div>
          )}
        </section>

        <section className="profile-panel profile-coupons" id="profile-coupons">
          <div className="profile-section-head">
            <h2>Mã giảm giá của tôi</h2>
            {couponCards.length > 2 && <button type="button" className="profile-link-button" onClick={() => setShowAllCoupons(value => !value)}>{showAllCoupons ? 'Thu gọn' : `Xem tất cả (${couponCards.length})`} <i className={`fa-solid ${showAllCoupons ? 'fa-angle-up' : 'fa-angle-right'}`} /></button>}
          </div>
          <div className="profile-coupon-list">
            {visibleCoupons.map(coupon => <article className="profile-coupon" key={coupon.id}>
              <div className="coupon-icon"><i className="fa-solid fa-ticket" /></div>
              <div>
                <strong>{coupon.code}</strong>
                <span>{coupon.description || `Giảm ${couponValue(coupon)} cho đơn từ ${formatVnd(Number(coupon.minOrderAmount))}`}</span>
                {coupon.freeShipping && <small>Miễn phí vận chuyển · </small>}
                {coupon.endDate && <small>Hết hạn {new Date(coupon.endDate).toLocaleDateString('vi-VN')}</small>}
              </div>
              <b>{couponValue(coupon)}</b>
            </article>)}
          </div>
        </section>
      </div>

      <section className="profile-panel" id="profile-addresses">
        <div className="profile-section-head">
          <h2>Địa chỉ giao hàng</h2>
          <span>{addresses.length || (form.address.trim() ? 1 : 0)} địa chỉ</span>
        </div>
        {mapAddress && <div className="profile-map-wrap">
          <iframe
            title={`Bản đồ vị trí: ${mapAddress}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <small>Bản đồ Google Maps cập nhật theo địa chỉ bạn nhập.</small>
        </div>}
        {addresses.length ? <div className="profile-address-list">
          {addresses.map(address => <article className="profile-address" key={address.id}>
            <div>
              <strong>{address.fullName}</strong>
              <span>{address.phone}</span>
              <p>{address.address}</p>
            </div>
            {address.isDefault && <em>Mặc định</em>}
          </article>)}
        </div> : form.address.trim() ? <div className="profile-address-list"><article className="profile-address"><div><strong>Địa chỉ mặc định</strong><p>{form.address}</p></div><em>Mặc định</em></article></div> : <div className="profile-empty"><i className="fa-solid fa-location-dot" /> Chưa có địa chỉ giao hàng.</div>}
      </section>

      <section className="profile-panel profile-orders">
        <div className="profile-section-head">
          <h2>Đơn hàng gần đây</h2>
          <Link to="/orders">Xem tất cả <i className="fa-solid fa-angle-right" /></Link>
        </div>
        {recentOrders.length ? <div className="profile-table-wrap">
          <table role="table" aria-label="Đơn hàng gần đây">
            <thead role="rowgroup"><tr role="row"><th scope="col">Mã đơn</th><th scope="col">Ngày đặt</th><th scope="col">Sản phẩm</th><th scope="col">Tổng tiền</th><th scope="col">Trạng thái</th><th scope="col">Chi tiết</th></tr></thead>
            <tbody role="rowgroup">{recentOrders.map(order => <tr key={order.id} role="row">
              <td role="cell" data-label="Mã đơn">#{order.id}</td>
              <td role="cell" data-label="Ngày đặt">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
              <td role="cell" data-label="Sản phẩm"><div className="profile-order-products">
                {order.items.slice(0, 3).map(item => item.productImage
                  ? <img key={item.id} src={imageUrl(item.productImage)} alt={item.productName} />
                  : <span key={item.id}><i className="fa-solid fa-box" /></span>)}
                <small>{order.items.length} sản phẩm</small>
              </div></td>
              <td role="cell" data-label="Tổng tiền">{formatVnd(order.totalAmount)}</td>
              <td role="cell" data-label="Trạng thái"><span className={`status-badge status-${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span></td>
              <td role="cell"><Link to={`/orders/${order.id}`} aria-label={`Xem đơn hàng #${order.id}`}>Xem <i className="fa-solid fa-angle-right" /></Link></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="profile-empty"><i className="fa-solid fa-receipt" /> Chưa có đơn hàng nào.</div>}
        {!!orderItems && <p className="profile-order-foot">Bạn đã đặt {orderItems} sản phẩm trong {orders.length} đơn hàng.</p>}
      </section>
    </div>
  </section>;
}
