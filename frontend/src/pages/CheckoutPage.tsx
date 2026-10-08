// file là trang checkout của giao diện người dùng.
import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatVnd } from '../api/client';
import { couponApi, orderApi, paymentApi } from '../api/services';
import type { Cart, Coupon, PaymentMethod } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  district: string;
  province: string;
  paymentMethod: PaymentMethod;
  note: string;
};

type CardType = 'DOMESTIC' | 'INTERNATIONAL';
type CardDetails = { holder: string; type: CardType; provider: string };

export function CheckoutPage() {
  const { cart, refresh } = useCart();
  const { user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [form, setForm] = useState<CheckoutForm>({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    district: '',
    province: '',
    paymentMethod: 'QR',
    note: '',
  });
  const [step, setStep] = useState(loc.pathname.endsWith('/payment') ? 2 : loc.pathname.endsWith('/invoice') ? 3 : 1);
  const [busy, setBusy] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetails>(() => {
    try {
      const saved = sessionStorage.getItem('giadung_checkout_card_demo');
      return saved ? JSON.parse(saved) as CardDetails : { holder: '', type: 'DOMESTIC', provider: 'NAPAS' };
    } catch { return { holder: '', type: 'DOMESTIC', provider: 'NAPAS' }; }
  });
  const [couponCode, setCouponCode] = useState(() => sessionStorage.getItem('giadung_checkout_coupon') || '');
  const [appliedCoupon, setAppliedCoupon] = useState<{ coupon: Coupon; discountAmount: number; finalAmount: number } | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [couponBusy, setCouponBusy] = useState(() => Boolean(sessionStorage.getItem('giadung_checkout_coupon_applied')));
  const [couponError, setCouponError] = useState('');
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => { couponApi.list().then((response) => setAvailableCoupons(response.data)).catch(() => setAvailableCoupons([])); }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('giadung_checkout');
      if (raw) {
        const saved = JSON.parse(raw) as CheckoutForm;
        setForm({ ...saved, district: saved.district || '', province: saved.province || '', paymentMethod: saved.paymentMethod === 'CASH' || saved.paymentMethod === 'CARD' ? saved.paymentMethod : 'QR' });
      }
    } catch {}
  }, []);

  useEffect(() => {
    sessionStorage.setItem('giadung_checkout', JSON.stringify(form));
  }, [form]);

  useEffect(() => { sessionStorage.setItem('giadung_checkout_card_demo', JSON.stringify(cardDetails)); }, [cardDetails]);

  useEffect(() => {
    if (!cart?.items?.length) nav('/cart');
  }, [cart?.items?.length, nav]);

  if (!cart?.items?.length) return null;

  const update = (key: keyof CheckoutForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const go = (nextStep: number) => {
    setStep(nextStep);
    nav(nextStep === 1 ? '/checkout/info' : nextStep === 2 ? '/checkout/payment' : '/checkout/invoice');
  };

  const nextInfo = (event: FormEvent) => {
    event.preventDefault();
    go(2);
  };

  const applyCoupon = async (requestedCode = couponCode) => {
    const code = requestedCode.trim().toUpperCase();
    if (!code || !cart) {
      setCouponError('Vui lòng nhập hoặc chọn mã giảm giá.');
      return;
    }
    setCouponBusy(true);
    setCouponError('');
    try {
      const { data } = await couponApi.validate(code, cart.total);
      setAppliedCoupon({ coupon: data.coupon, discountAmount: data.discountAmount, finalAmount: data.finalAmount });
      setCouponCode(data.coupon.code);
      sessionStorage.setItem('giadung_checkout_coupon', data.coupon.code);
      sessionStorage.setItem('giadung_checkout_coupon_applied', data.coupon.code);
      setVoucherOpen(false);
    } catch (error) {
      setAppliedCoupon(null);
      sessionStorage.removeItem('giadung_checkout_coupon_applied');
      setCouponError((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Không thể áp dụng mã giảm giá.');
    } finally {
      setCouponBusy(false);
    }
  };

  const chooseCoupon = (code: string) => {
    setCouponCode(code);
    void applyCoupon(code);
  };

  const removeCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    sessionStorage.removeItem('giadung_checkout_coupon');
    sessionStorage.removeItem('giadung_checkout_coupon_applied');
  };

  const updateCouponCode = (code: string) => {
    setCouponCode(code);
    setAppliedCoupon(null);
    setCouponError('');
    sessionStorage.setItem('giadung_checkout_coupon', code);
    sessionStorage.removeItem('giadung_checkout_coupon_applied');
  };

  useEffect(() => {
    const savedCode = sessionStorage.getItem('giadung_checkout_coupon_applied');
    if (!savedCode || !cart) return;
    let active = true;
    setCouponBusy(true);
    couponApi.validate(savedCode, cart.total).then(({ data }) => {
      if (!active) return;
      setAppliedCoupon({ coupon: data.coupon, discountAmount: data.discountAmount, finalAmount: data.finalAmount });
      setCouponCode(data.coupon.code);
    }).catch(() => {
      if (!active) return;
      sessionStorage.removeItem('giadung_checkout_coupon_applied');
      setAppliedCoupon(null);
    }).finally(() => {
      if (active) setCouponBusy(false);
    });
    return () => { active = false; };
  }, [cart?.total]);

  const deliveryAddress = [form.address.trim(), form.district.trim(), form.province.trim()].filter(Boolean).join(', ');

  const nextPay = (event: FormEvent) => {
    event.preventDefault();
    go(3);
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setOrderError('');
    try {
      const { data: order } = await orderApi.create({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        address: deliveryAddress,
        paymentMethod: form.paymentMethod,
        note: form.note,
        couponCode: appliedCoupon?.coupon.code,
      });
      await refresh();
      sessionStorage.removeItem('giadung_checkout');
      sessionStorage.removeItem('giadung_checkout_card_demo');
      sessionStorage.removeItem('giadung_checkout_coupon');
      sessionStorage.removeItem('giadung_checkout_coupon_applied');

      if (form.paymentMethod === 'QR' || form.paymentMethod === 'PAYOS') {
        const { data } = await paymentApi.createPayOSPaymentLink(order.id);
        window.location.href = data.checkoutUrl;
        return;
      }

      nav(`/checkout/success/${order.id}`, { replace: true });
    } catch (error) {
      setOrderError((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Chưa thể tạo đơn hàng. Vui lòng kiểm tra lại thông tin và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    {step === 1 && <>
      <section className="page-hero compact">
        <span className="eyebrow dark">Checkout</span>
        <h1>Thông tin giao hàng</h1>
        <p>Nhập đầy đủ thông tin. Dấu sao chuyển xanh khi trường hợp lệ.</p>
      </section>
      <section className="checkout-wrap">
        <form className="checkout-card" onSubmit={nextInfo}>
          <div className="checkout-steps">
            <Step active={step >= 1} icon="fa-location-dot" text="Thông tin" />
            <Step active={step >= 2} icon="fa-wallet" text="Thanh toán" />
            <Step active={step >= 3} icon="fa-file-invoice" text="Xác nhận" />
          </div>
          <div className="checkout-section-intro">
            <h2 className="checkout-title"><i className="fa-solid fa-user" /> Thông tin người mua</h2>
            <p>Để tiếp tục đặt hàng, vui lòng nhập thông tin người nhận bên dưới.</p>
          </div>
          <div className="form-grid checkout-info-grid">
            <Field label="Họ và tên người nhận" hint="Tên người nhận hàng" autoComplete="name" value={form.fullName} set={(value) => update('fullName', value)} required />
            <Field label="Số điện thoại" hint="Ví dụ: 0901 234 567" autoComplete="tel" value={form.phone} set={(value) => update('phone', value)} type="tel" required />
            <Field label="Email nhận xác nhận đơn" hint="Bạn sẽ nhận thông tin đơn hàng qua email này" autoComplete="email" value={form.email} set={(value) => update('email', value)} type="email" required full />
            <Field label="Địa chỉ" hint="Số nhà, tên đường, phường/xã" autoComplete="street-address" value={form.address} set={(value) => update('address', value)} required full />
            <Field label="Quận / Huyện" autoComplete="address-level2" value={form.district} set={(value) => update('district', value)} required />
            <Field label="Tỉnh / Thành phố" autoComplete="address-level1" value={form.province} set={(value) => update('province', value)} required />
            <Field label="Ghi chú cho người giao hàng" hint="Không bắt buộc · Ví dụ: gọi trước khi giao" value={form.note} set={(value) => update('note', value)} textarea full />
          </div>
          {orderError && <div className="checkout-order-error" role="alert">{orderError}</div>}
          <label className="checkout-terms"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required /><span>Tôi đã đọc và đồng ý với các điều kiện giao dịch chung của website.</span></label>
          <div className="actions">
            <button className="btn btn-primary">Tiếp tục thanh toán <i className="fa-solid fa-arrow-right" /></button>
          </div>
        </form>
        <Summary cart={cart} couponCode={couponCode} setCouponCode={updateCouponCode} appliedCoupon={appliedCoupon} availableCoupons={availableCoupons} couponBusy={couponBusy} couponError={couponError} voucherOpen={voucherOpen} setVoucherOpen={setVoucherOpen} onApplyCoupon={() => applyCoupon()} onChooseCoupon={chooseCoupon} onRemoveCoupon={removeCoupon} />
      </section>
    </>}

    {step === 2 && <>
      <section className="page-hero compact">
        <span className="eyebrow dark">Payment</span>
        <h1>Chọn phương thức thanh toán</h1>
        <p>Chọn phương thức phù hợp. Thanh toán thẻ hiện đang chạy ở chế độ mô phỏng phát triển.</p>
      </section>
      <section className="payment-shell">
        <form className="payment-panel" onSubmit={nextPay}>
          <div className="payment-head">
            <h2 className="payment-title"><i className="fa-solid fa-wallet" /> Phương thức thanh toán</h2>
            <span className="payment-pill"><i className="fa-solid fa-shield-halved" /> Bảo mật SSL</span>
          </div>
          <div className="payment-methods">
            {([
              ['QR', 'Mã QR', 'Quét mã để thanh toán online', 'fa-qrcode'],
              ['CASH', 'Tiền mặt', 'Thanh toán khi nhận hàng', 'fa-money-bill-wave'],
              ['CARD', 'Thẻ nội địa / quốc tế', 'Mô phỏng giao diện thanh toán thẻ', 'fa-credit-card'],
            ] as const).map(([value, name, sub, icon]) => (
              <label className="payment-method" key={value}>
                <input type="radio" checked={form.paymentMethod === value} onChange={() => update('paymentMethod', value)} />
                <span className="payment-method-card">
                  <span className="method-icon"><i className={`fa-solid ${icon}`} /></span>
                  <span className="method-name">{name}</span>
                  <span className="method-sub">{sub}</span>
                </span>
              </label>
            ))}
          </div>
          {(form.paymentMethod === 'QR' || form.paymentMethod === 'PAYOS') && <div className="method-detail active">
            <div className="cash-box">
              <i className="fa-solid fa-shield-halved" />
              <div>
                <h3>Thanh toán PayOS</h3>
                <p>Chọn “Xem hóa đơn xác nhận”, sau đó xác nhận đơn hàng để mở trang PayOS và quét mã QR thanh toán.</p>
              </div>
            </div>
          </div>}
          {form.paymentMethod === 'CASH' && <div className="method-detail active">
            <div className="cash-box">
              <i className="fa-solid fa-truck-fast" />
              <div>
                <h3>Thanh toán tiền mặt khi nhận hàng</h3>
                <p>Bạn kiểm tra sản phẩm, hóa đơn và thanh toán trực tiếp cho nhân viên giao hàng.</p>
              </div>
            </div>
          </div>}
          {form.paymentMethod === 'CARD' && <div className="method-detail active">
            <div className="card-demo-notice"><i className="fa-solid fa-flask" /><div><strong>Chế độ mô phỏng phát triển</strong><span>Chưa kết nối ngân hàng và không phát sinh giao dịch thật. Không nhập số thẻ, ngày hết hạn hoặc mã CVV thật. Thông tin bên dưới chỉ dùng để xem trước đơn.</span></div></div>
            <div className="card-demo-preview"><div><span>HUNG GIA DỤNG</span><b>{cardDetails.type === 'DOMESTIC' ? 'NỘI ĐỊA' : 'QUỐC TẾ'}</b></div><strong>••••　••••　••••　4242</strong><small>THẺ MÔ PHỎNG · KHÔNG THU TIỀN</small></div>
            <div className="card-demo-form">
              <Field label="Tên chủ thẻ (mô phỏng)" hint="Nhập tên bất kỳ để hoàn tất bước thử nghiệm" autoComplete="off" value={cardDetails.holder} set={(holder) => setCardDetails((current) => ({ ...current, holder }))} required full />
              <div className="field">
                <label htmlFor="demo-card-type">Loại thẻ <span className="required">*</span></label>
                <select id="demo-card-type" className="form-select" required value={cardDetails.type} onChange={(event) => {
                  const type = event.target.value as CardType;
                  setCardDetails({ holder: cardDetails.holder, type, provider: type === 'DOMESTIC' ? 'NAPAS' : 'VISA' });
                }}>
                  <option value="DOMESTIC">Thẻ nội địa</option>
                  <option value="INTERNATIONAL">Thẻ quốc tế</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="demo-card-provider">Ngân hàng / tổ chức thẻ <span className="required">*</span></label>
                <select id="demo-card-provider" className="form-select" required value={cardDetails.provider} onChange={(event) => setCardDetails((current) => ({ ...current, provider: event.target.value }))}>
                  {(cardDetails.type === 'DOMESTIC'
                    ? [['NAPAS', 'NAPAS'], ['VIETCOMBANK', 'Vietcombank'], ['BIDV', 'BIDV'], ['TECHCOMBANK', 'Techcombank'], ['MB', 'MB Bank'], ['ACB', 'ACB']]
                    : [['VISA', 'Visa'], ['MASTERCARD', 'Mastercard'], ['JCB', 'JCB'], ['AMEX', 'American Express']]
                  ).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>}
          <button className="btn btn-primary btn-wide" style={{ marginTop: 24 }}>
            <i className="fa-solid fa-file-invoice" /> {form.paymentMethod === 'CARD' ? 'Tiếp tục xem đơn mô phỏng' : 'Xem hóa đơn xác nhận'}
          </button>
          <button type="button" className="btn btn-ghost btn-wide" style={{ marginTop: 10 }} onClick={() => go(1)}>
            Quay lại
          </button>
        </form>
        <Summary cart={cart} payment customer={{ ...form, address: deliveryAddress }} couponCode={couponCode} setCouponCode={updateCouponCode} appliedCoupon={appliedCoupon} availableCoupons={availableCoupons} couponBusy={couponBusy} couponError={couponError} voucherOpen={voucherOpen} setVoucherOpen={setVoucherOpen} onApplyCoupon={() => applyCoupon()} onChooseCoupon={chooseCoupon} onRemoveCoupon={removeCoupon} />
      </section>
    </>}

    {step === 3 && <div className="invoice-container">
      <div className="invoice-header">
        <span className="eyebrow dark">HUNG GIA DỤNG · ĐƠN HÀNG</span>
        <h1><i className="fa-solid fa-file-invoice" /> Hóa Đơn Xác Nhận</h1>
        <p>Kiểm tra đầy đủ thông tin giao hàng, sản phẩm và thanh toán trước khi đặt hàng.</p>
      </div>
      <form className="invoice-box" onSubmit={confirm}>
        <div className="invoice-brand-row"><div><strong>HUNG GIA DỤNG</strong><span>Hóa đơn tạm tính · Mã đơn sẽ được tạo sau khi xác nhận</span></div><span className="invoice-status"><i className="fa-solid fa-circle-check" /> Chờ xác nhận</span></div>
        <div className="invoice-section">
          <div className="invoice-section-title">Thông tin giao hàng</div>
          <div className="invoice-info">
            <Info label="Họ và tên" value={form.fullName} />
            <Info label="Email" value={form.email} />
            <Info label="Số điện thoại" value={form.phone} />
            <Info label="Địa chỉ giao hàng" value={deliveryAddress} />
            <Info label="Ghi chú giao hàng" value={form.note || 'Không có'} />
            {appliedCoupon && <Info label="Mã giảm giá" value={`${appliedCoupon.coupon.code} · giảm ${formatVnd(appliedCoupon.discountAmount)}`} />}
          </div>
        </div>
        <div className="invoice-section">
          <div className="invoice-section-title">Sản phẩm</div>
          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th style={{ textAlign: 'right' }}>Đơn giá</th>
                <th style={{ textAlign: 'center' }}>Số lượng</th>
                <th style={{ textAlign: 'right' }}>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.product.name}</strong>{item.product.brand && <small className="invoice-product-meta">{item.product.brand}{item.product.category ? ` · ${item.product.category}` : ''}</small>}</td>
                  <td style={{ textAlign: 'right' }}>{formatVnd(item.product.price)}</td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatVnd(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-total">
          <div className="invoice-total-box">
            <div className="invoice-total-line"><span>Tạm tính ({cart.itemCount} sản phẩm)</span><strong>{formatVnd(cart.total)}</strong></div>
            <div className="invoice-total-line"><span>Phí giao hàng</span><strong>Miễn phí</strong></div>
            {appliedCoupon && <div className="invoice-total-line invoice-discount-line"><span>Voucher {appliedCoupon.coupon.code}</span><strong>−{formatVnd(appliedCoupon.discountAmount)}</strong></div>}
            <div className="invoice-total-label">Tổng thanh toán</div>
            <div className="invoice-total-amount">{formatVnd(appliedCoupon?.finalAmount ?? cart.total)}</div>
            <div className="payment-method-box">
              <div style={{ fontSize: '.9rem', color: 'var(--muted)' }}>Phương thức thanh toán</div>
              <div style={{ fontWeight: 600, marginTop: '.5rem' }}>{form.paymentMethod === 'CARD' ? `Mô phỏng ${cardDetails.type === 'DOMESTIC' ? 'thẻ nội địa' : 'thẻ quốc tế'} · ${cardDetails.provider} · ${cardDetails.holder}` : paymentLabel(form.paymentMethod)}</div>
              {form.paymentMethod === 'CARD' && <small className="invoice-demo-note">Không có giao dịch thật · Không thu tiền</small>}
            </div>
          </div>
        </div>
        <p className="invoice-disclaimer">Hóa đơn này là thông tin xác nhận đơn hàng, không thay thế hóa đơn VAT.</p>
        {orderError && <div className="checkout-order-error" role="alert">{orderError}</div>}
        <div className="actions">
          <button type="button" className="btn-back invoice-print-button" onClick={() => window.print()}><i className="fa-solid fa-print" /> In hóa đơn</button>
          <button className="btn-confirm" disabled={busy}><i className="fa-solid fa-check" /> {busy ? 'Đang xác nhận...' : 'Xác nhận đơn hàng'}</button>
          <button type="button" className="btn-back" onClick={() => go(2)}><i className="fa-solid fa-arrow-left" /> Quay lại</button>
        </div>
      </form>
    </div>}
  </>;
}

function Step({ active, icon, text }: { active: boolean; icon: string; text: string }) {
  return <div className={`checkout-step ${active ? 'active' : ''}`}><i className={`fa-solid ${icon}`} /><span>{text}</span></div>;
}

function Field({ label, hint, autoComplete, value, set, type = 'text', textarea = false, required = false, full = false }: { label: string; hint?: string; autoComplete?: string; value: string; set: (value: string) => void; type?: string; textarea?: boolean; required?: boolean; full?: boolean }) {
  return <div className={`field ${full ? 'full' : ''}`}>
    <label>{label} {required && <span className="required">*</span>}</label>
    {textarea
      ? <textarea className="form-input" value={value} onChange={(event) => set(event.target.value)} required={required} autoComplete={autoComplete} />
      : <input className="form-input" type={type} value={value} onChange={(event) => set(event.target.value)} required={required} autoComplete={autoComplete} />}
    {hint && <small className="field-hint">{hint}</small>}
  </div>;
}

function paymentLabel(method: PaymentMethod) {
  return method === 'CASH' ? 'Tiền mặt khi nhận hàng' : method === 'CARD' ? 'Thẻ tín dụng/ghi nợ' : 'Thanh toán trực tuyến qua PayOS (QR)';
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="invoice-item"><div className="invoice-item-label">{label}</div><div className="invoice-item-value">{value}</div></div>;
}

function Summary({ cart, payment = false, customer, couponCode, setCouponCode, appliedCoupon, availableCoupons, couponBusy, couponError, voucherOpen, setVoucherOpen, onApplyCoupon, onChooseCoupon, onRemoveCoupon }: {
  cart: Cart;
  payment?: boolean;
  customer?: CheckoutForm;
  couponCode: string;
  setCouponCode: (value: string) => void;
  appliedCoupon: { coupon: Coupon; discountAmount: number; finalAmount: number } | null;
  availableCoupons: Coupon[];
  couponBusy: boolean;
  couponError: string;
  voucherOpen: boolean;
  setVoucherOpen: (open: boolean) => void;
  onApplyCoupon: () => void;
  onChooseCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
}) {
  const now = Date.now();
  const eligibleCoupons = availableCoupons.filter((coupon) => coupon.isActive && new Date(coupon.startDate).getTime() <= now && new Date(coupon.endDate).getTime() >= now && (coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit));
  const couponDescription = (coupon: Coupon) => `${coupon.description ? `${coupon.description} · ` : ''}${coupon.discountType === 'percentage' ? `Giảm ${coupon.discountValue}%` : `Giảm ${formatVnd(Number(coupon.discountValue))}`} · Đơn tối thiểu ${formatVnd(Number(coupon.minOrderAmount))}`;
  return <aside className="summary-panel">
    <h2 className="summary-title"><i className="fa-solid fa-receipt" /> Tổng tiền đơn hàng</h2>
    <div className="voucher-panel">
      <div className="voucher-entry">
        <input aria-label="Mã voucher" placeholder="Nhập mã voucher" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} />
        <button type="button" className="voucher-choose" onClick={() => setVoucherOpen(!voucherOpen)}><i className="fa-solid fa-ticket" /> Chọn mã</button>
      </div>
      <button type="button" className="voucher-apply" onClick={onApplyCoupon} disabled={couponBusy || !couponCode.trim()}>{couponBusy ? 'Đang kiểm tra…' : 'Áp dụng mã'}</button>
      {couponError && <small className="voucher-error" role="alert">{couponError}</small>}
      {appliedCoupon && <div className="voucher-applied"><i className="fa-solid fa-circle-check" /> Đã áp dụng <strong>{appliedCoupon.coupon.code}</strong><button type="button" aria-label="Gỡ mã giảm giá" onClick={onRemoveCoupon}>Gỡ</button></div>}
      {voucherOpen && <div className="voucher-picker" role="dialog" aria-label="Chọn mã giảm giá">
        <div className="voucher-picker-head"><strong>Mã giảm giá khả dụng</strong><button type="button" aria-label="Đóng danh sách mã" onClick={() => setVoucherOpen(false)}>×</button></div>
        {eligibleCoupons.length ? eligibleCoupons.map((coupon) => {
          const meetsMinimum = cart.total >= Number(coupon.minOrderAmount);
          return <button type="button" className="voucher-option" key={coupon.id} disabled={!meetsMinimum} onClick={() => onChooseCoupon(coupon.code)}><span><strong>{coupon.code}</strong><small>{couponDescription(coupon)}</small>{!meetsMinimum && <small className="voucher-option-hint">Cần thêm {formatVnd(Number(coupon.minOrderAmount) - cart.total)} để sử dụng</small>}</span><i className="fa-solid fa-chevron-right" /></button>;
        }) : <p className="voucher-empty">Hiện chưa có mã giảm giá khả dụng.</p>}
      </div>}
    </div>
    <div className="summary-row"><span>Tạm tính ({cart.itemCount} sản phẩm)</span><strong>{formatVnd(cart.total)}</strong></div>
    <div className="summary-row"><span>Giao hàng</span><strong>Miễn phí</strong></div>
    <div className="summary-row"><span>Giảm giá voucher</span><strong className="summary-discount">−{formatVnd(appliedCoupon?.discountAmount ?? 0)}</strong></div>
    <div className="summary-row summary-total"><span>Thành tiền</span><strong>{formatVnd(appliedCoupon?.finalAmount ?? cart.total)}</strong></div>
    {payment && customer && <div className="customer-box"><strong>Người nhận</strong><br />{customer.fullName}<br />{customer.phone}<br />{customer.address}</div>}
    <div className="secure-note"><i className="fa-solid fa-lock" /> Thông tin được mã hóa khi xử lý thanh toán</div>
  </aside>;
}
