// file là trang productlist của giao diện người dùng.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { productApi } from '../api/services';
import type { Product } from '../api/types';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';

const quickPriceRanges = [
  { label: 'Dưới 5 triệu', min: 0, max: 5_000_000 },
  { label: '5 – 15 triệu', min: 5_000_000, max: 15_000_000 },
  { label: '15 – 25 triệu', min: 15_000_000, max: 25_000_000 },
  { label: '25 – 35 triệu', min: 25_000_000, max: 35_000_000 },
  { label: '35 – 45 triệu', min: 35_000_000, max: 45_000_000 },
  { label: '45 – 60 triệu', min: 45_000_000, max: 60_000_000 },
  { label: '60 – 80 triệu', min: 60_000_000, max: 80_000_000 },
  { label: 'Từ 80 triệu trở lên', min: 80_000_000, max: null },
];

export function ProductListPage() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState('');
  const [pricePreset, setPricePreset] = useState('');
  const category = params.get('category');
  const visibleProducts = useMemo(() => products
    .filter((product) => (minPrice === null || product.price >= minPrice) && (maxPrice === null || product.price <= maxPrice))
    .sort((a, b) => sort === 'price-asc' ? a.price - b.price
      : sort === 'price-desc' ? b.price - a.price
        : sort === 'name' ? a.name.localeCompare(b.name, 'vi') : 0), [products, minPrice, maxPrice, sort]);

  const selectPricePreset = (value: string) => {
    setPricePreset(value);
    if (!value) {
      setMinPrice(null);
      setMaxPrice(null);
      return;
    }
    const range = quickPriceRanges[Number(value)];
    setMinPrice(range.min);
    setMaxPrice(range.max);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    productApi.list({ keyword: params.get('keyword') || undefined, category: category || undefined })
      .then(r => { if (active) setProducts(r.data); })
      .catch(() => { if (active) { setProducts([]); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params, category, retry]);

  return <>
    <section className="page-hero compact">
      <nav className="breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Sản phẩm</span></nav>
      <h1>{params.get('keyword') ? <>Kết quả cho “{params.get('keyword')}”</> : category || 'Tất cả sản phẩm'}</h1>
      <p>Lọc nhanh nồi cơm điện, máy xay, máy hút bụi và thiết bị gia dụng chính hãng.</p>
    </section>
    <section className="shop-layout section">
      <div className="shop-content">
        <div className="shop-toolbar reveal">
          <span role="status">{loading ? 'Đang tải sản phẩm...' : failed ? 'Chưa thể tải sản phẩm' : <>Tìm thấy <strong>{visibleProducts.length}</strong> / {products.length} sản phẩm</>}</span>
          <div className="product-filter-controls">
            <div className="price-filter" aria-label="Lọc sản phẩm theo giá">
              <label htmlFor="price-range-filter">Khoảng giá</label>
              <select id="price-range-filter" className="price-range-select" value={pricePreset} disabled={loading || failed} onChange={(event) => selectPricePreset(event.target.value)}>
                <option value="">Tất cả mức giá</option>
                {quickPriceRanges.map((range, index) => <option key={range.label} value={index}>{range.label}</option>)}
              </select>
            </div>
            <div className="product-sort">
              <label htmlFor="sortSelect">Sắp xếp</label>
              <select id="sortSelect" aria-label="Sắp xếp sản phẩm" disabled={loading || failed} value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="">Mặc định</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option><option value="name">Tên A-Z</option>
              </select>
            </div>
          </div>
        </div>
        {loading ? <div className="product-grid" role="status" aria-label="Đang tải sản phẩm" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}</div> :
          failed ? <div className="empty-state" role="alert"><RotateCw size={32} /><h2>Chưa thể tải sản phẩm</h2><p>Vui lòng kiểm tra kết nối và thử lại.</p><button className="btn btn-primary" onClick={() => setRetry(v => v + 1)}><RotateCw size={16} /> Thử lại</button></div> :
          visibleProducts.length ? <div className="product-grid" id="productsGrid">{visibleProducts.map((p,i)=><ProductCard key={p.id} product={p} index={i}/>)}</div> :
          <div className="empty-state reveal"><i className="fa-solid fa-magnifying-glass" /><h2>{products.length ? 'Không có sản phẩm trong khoảng giá này' : 'Không tìm thấy sản phẩm'}</h2><p>{products.length ? 'Hãy chọn một khoảng giá khác.' : 'Thử từ khóa khác hoặc quay về toàn bộ sản phẩm.'}</p>{(minPrice !== null || maxPrice !== null) ? <button type="button" className="btn btn-primary" onClick={() => selectPricePreset('')}>Xem tất cả mức giá</button> : <Link to="/products" className="btn btn-primary">Xem tất cả</Link>}</div>}
      </div>
    </section>
  </>;
}
